// Small tools inside the editor that are not marks: tells and gaps (derived,
// recomputed as you type), the selection toolbar, ghost text, and review on
// sight.

import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, showTooltip, type Tooltip, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { findTells } from '@shared/tells'
import { editorHooks, liveMarks, machineEdit, removeMark } from './marks'

// ---- Tells and gaps ---------------------------------------------------------

export const setBan = StateEffect.define<string[]>()
export const banField = StateField.define<string[]>({
  create: () => [],
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setBan)) return e.value
    return v
  }
})

const GAP = /\[[^\]\n]{1,200}\](?!\()/g

export function findGaps(text: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  GAP.lastIndex = 0
  for (let m = GAP.exec(text); m; m = GAP.exec(text)) out.push({ from: m.index, to: m.index + m[0].length })
  return out
}

function derived(state: EditorState, prose: boolean): DecorationSet {
  const text = state.doc.toString()
  const ranges: Array<ReturnType<Decoration['range']>> = []
  if (prose) {
    for (const t of findTells(text, state.field(banField))) {
      ranges.push(Decoration.mark({ class: 'ck-mark ck-tell', attributes: { title: `tell: ${t.text}` } }).range(t.from, t.to))
    }
    for (const g of findGaps(text)) ranges.push(Decoration.mark({ class: 'ck-mark ck-gap', attributes: { title: 'gap: a spot to draft later. Put the cursor here and press Draft.' } }).range(g.from, g.to))
  }
  return Decoration.set(ranges, true)
}

export function derivedMarks(prose: boolean): Extension {
  return [
    banField,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = derived(view.state, prose)
        }
        update(u: ViewUpdate): void {
          if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(setBan)))) this.decorations = derived(u.state, prose)
        }
      },
      { decorations: (v) => v.decorations }
    )
  ]
}

export function countDerived(state: EditorState, prose: boolean): { tell: number; gap: number } {
  if (!prose) return { tell: 0, gap: 0 }
  const text = state.doc.toString()
  return { tell: findTells(text, state.field(banField, false) ?? []).length, gap: findGaps(text).length }
}

// ---- Selection toolbar --------------------------------------------------------

const PROSE_TOOLS: Array<[string, string]> = [
  ['plainer', 'Plainer'],
  ['shorter', 'Shorter'],
  ['rougher', 'Rougher'],
  ['concrete', 'More concrete'],
  ['sample', 'Like my samples']
]

function selectionTooltip(state: EditorState, prose: boolean): readonly Tooltip[] {
  const sel = state.selection.main
  if (sel.empty || sel.to - sel.from < 2) return []
  return [
    {
      pos: sel.from,
      above: true,
      arrow: false,
      create: (view) => {
        const dom = document.createElement('div')
        dom.className = 'ck-seltools'
        const hooks = view.state.facet(editorHooks)
        const add = (label: string, cls: string, run: () => void, title?: string): void => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = `ck-seltool ${cls}`
          b.textContent = label
          if (title) b.title = title
          b.addEventListener('mousedown', (e) => e.preventDefault())
          b.addEventListener('click', () => {
            const s = view.state.selection.main
            run.call(null)
            void s
          })
          dom.appendChild(b)
        }
        const range = (): { from: number; to: number } => view.state.selection.main
        if (hooks.attach) add('Comment', 'comment', () => hooks.attach!(view, range().from, range().to), 'Attach this passage to a chat message')
        if (prose && hooks.humanize) {
          for (const [tool, label] of PROSE_TOOLS) add(label, 'tool', () => hooks.humanize!(view, tool, range().from, range().to), `The writer rewrites the selection: ${label.toLowerCase()}. Arrives as a suggestion.`)
        }
        if (prose && hooks.alternatives) add('Alternatives', 'tool', () => hooks.alternatives!(view, range().from, range().to), 'Other ways to say the selected sentence')
        return { dom, offset: { x: 0, y: 6 } }
      }
    }
  ]
}

export function selectionTools(prose: boolean): Extension {
  return StateField.define<readonly Tooltip[]>({
    create: (s) => selectionTooltip(s, prose),
    update: (tips, tr) => (tr.docChanged || tr.selection ? selectionTooltip(tr.state, prose) : tips),
    provide: (f) => showTooltip.computeN([f], (s) => s.field(f))
  })
}

// ---- Ghost text ------------------------------------------------------------------

const setGhost = StateEffect.define<{ pos: number; text: string } | null>()
const ghostField = StateField.define<{ pos: number; text: string } | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value
    if (tr.docChanged || tr.selection) return null
    return v
  },
  provide: (f) =>
    EditorView.decorations.from(f, (g) =>
      g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none
    )
})

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(o: GhostWidget): boolean {
    return o.text === this.text
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'ck-ghost'
    el.textContent = this.text
    el.title = 'Tab to take it; keep typing to ignore it'
    return el
  }
}

/**
 * Next-sentence ghost text while writing fresh prose. Tab takes it (it lands
 * as unreviewed, since the words are Claude's); typing anything ignores it.
 */
export function ghostText(fetch: (before: string) => Promise<string | null>, onTake: (view: EditorView, from: number, to: number) => void): Extension {
  return [
    ghostField,
    ViewPlugin.fromClass(
      class {
        timer: ReturnType<typeof setTimeout> | null = null
        constructor(readonly view: EditorView) {}
        update(u: ViewUpdate): void {
          if (!u.docChanged || u.transactions.some((t) => t.annotation(machineEdit))) return
          if (this.timer) clearTimeout(this.timer)
          const sel = u.state.selection.main
          const line = u.state.doc.lineAt(sel.head)
          if (!sel.empty || sel.head !== line.to || line.text.trim().length < 20 || /^#/.test(line.text)) return
          this.timer = setTimeout(() => {
            const pos = this.view.state.selection.main.head
            const before = this.view.state.doc.sliceString(Math.max(0, pos - 4000), pos)
            void fetch(before).then((text) => {
              if (!text || this.view.state.selection.main.head !== pos) return
              this.view.dispatch({ effects: setGhost.of({ pos, text }) })
            })
          }, 1500)
        }
        destroy(): void {
          if (this.timer) clearTimeout(this.timer)
        }
      }
    ),
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => {
            const g = view.state.field(ghostField)
            if (!g) return false
            view.dispatch({
              changes: { from: g.pos, insert: g.text },
              selection: EditorSelection.cursor(g.pos + g.text.length),
              annotations: machineEdit.of('claude')
            })
            onTake(view, g.pos, g.pos + g.text.length)
            return true
          }
        }
      ])
    )
  ]
}

// ---- Review on sight ---------------------------------------------------------------

/** Optional: a paragraph counts as reviewed once it has been fully on screen for a few seconds. */
export function reviewWhenSeen(): Extension {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null
      constructor(readonly view: EditorView) {
        this.schedule()
      }
      update(u: ViewUpdate): void {
        if (u.viewportChanged || u.docChanged || u.geometryChanged) this.schedule()
      }
      schedule(): void {
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => this.check(), 4000)
      }
      check(): void {
        const view = this.view
        const box = view.scrollDOM.getBoundingClientRect()
        const seen: string[] = []
        for (const m of liveMarks(view.state)) {
          if (m.record.kind !== 'unreviewed') continue
          const a = view.coordsAtPos(m.from)
          const b = view.coordsAtPos(m.to)
          if (a && b && a.top >= box.top && b.bottom <= box.bottom) seen.push(m.record.id)
        }
        if (seen.length) view.dispatch({ effects: seen.map((id) => removeMark.of(id)) })
      }
      destroy(): void {
        if (this.timer) clearTimeout(this.timer)
      }
    }
  )
}
