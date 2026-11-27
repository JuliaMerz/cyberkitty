// Claude's marks inside an editor. Each mark is a faint shade behind the text.
// Hovering it opens a few icon-sized buttons that float at the end of the
// shade, so nothing on the page moves. Typing inside a mark is the author
// taking the paragraph over, which counts as reviewing it.
//
// A suggestion is not in the file yet: the words it would replace are struck
// through, and the proposed words follow, dashed and paler. Accept puts them
// in the file; Reject drops them.

import { Annotation, Facet, StateEffect, StateField, type EditorState, type Transaction } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, hoverTooltip, type Tooltip, WidgetType } from '@codemirror/view'
import { makeAnchor, paragraphs, type Resolved } from '@shared/anchors'
import type { MarkKind, MarkRecord, SceneFile } from '@shared/types'

/** Annotates transactions made by Claude or by reloading from disk, which never review anything. */
export const machineEdit = Annotation.define<'claude' | 'external'>()

export interface LiveMark {
  record: MarkRecord
  from: number
  to: number
}

/** What an editor can ask of the page around it. */
export interface EditorHooks {
  alternatives?: (view: EditorView, from: number, to: number) => void
  attach?: (view: EditorView, from: number, to: number) => void
  openAlert?: (id: string) => void
  humanize?: (view: EditorView, tool: string, from: number, to: number) => void
}
export const editorHooks = Facet.define<EditorHooks, EditorHooks>({ combine: (v) => v[0] ?? {} })

export const setMarks = StateEffect.define<Array<{ record: MarkRecord; range: Resolved | { from: number; to: number } }>>()
export const addMarks = StateEffect.define<Array<{ record: MarkRecord; from: number; to: number }>>()
export const removeMark = StateEffect.define<string>()
export const removeAlertMarks = StateEffect.define<string>()

function deco(record: MarkRecord): Decoration {
  const cls =
    record.kind === 'suggested'
      ? record.insert === 'after'
        ? 'ck-sug-anchor'
        : 'ck-mark ck-suggested ck-sug-replace'
      : `ck-mark ck-${record.kind}`
  return Decoration.mark({ class: cls, attributes: { 'data-mark-id': record.id }, inclusive: false, record })
}

export const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let set = value.map(tr.changes)
    if (tr.docChanged && !tr.annotation(machineEdit) && !tr.isUserEvent('undo') && !tr.isUserEvent('redo')) {
      // The author edited inside a mark: the paragraph is now theirs and reviewed.
      const touched = touchedByAuthor(value, tr)
      if (touched.length) set = set.update({ filter: (_f, _t, d) => !touched.includes((d.spec.record as MarkRecord).id) })
    }
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        set = Decoration.set(
          e.value.filter((m) => m.range.from < m.range.to).map((m) => deco(m.record).range(m.range.from, m.range.to)),
          true
        )
      } else if (e.is(addMarks)) {
        set = set.update({ add: e.value.filter((m) => m.from < m.to).map((m) => deco(m.record).range(m.from, m.to)), sort: true })
      } else if (e.is(removeMark)) {
        set = set.update({ filter: (_f, _t, d) => (d.spec.record as MarkRecord).id !== e.value })
      } else if (e.is(removeAlertMarks)) {
        set = set.update({ filter: (_f, _t, d) => (d.spec.record as MarkRecord).alertId !== e.value })
      }
    }
    return set
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Ids of unreviewed or updated marks this author edit lands in. */
export function touchedByAuthor(value: DecorationSet, tr: Transaction): string[] {
  const touched: string[] = []
  value.between(0, tr.startState.doc.length, (from, to, d) => {
    const rec = d.spec.record as MarkRecord
    if (rec.kind !== 'unreviewed' && rec.kind !== 'updated') return
    let hit = false
    tr.changes.iterChanges((fA, tA, _fB, _tB, inserted) => {
      if (fA < to && tA > from) hit = true
      else if (fA === tA && fA > from && fA < to) hit = true
      // Typing onto either end of the paragraph is editing it; starting a new line is not.
      else if (fA === tA && (fA === from || fA === to) && !inserted.toString().includes('\n')) hit = true
    })
    if (hit) touched.push(rec.id)
  })
  return touched
}

class SuggestionWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly text: string,
    readonly block: boolean
  ) {
    super()
  }
  eq(other: SuggestionWidget): boolean {
    return other.id === this.id && other.text === this.text
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = `ck-suggestion${this.block ? ' block' : ''}`
    el.setAttribute('data-mark-id', this.id)
    el.textContent = this.text
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** The proposed words of each suggestion, shown after the words they would replace. */
const suggestionWidgets = EditorView.decorations.compute([marksField], (state) => {
  const out: Array<ReturnType<Decoration['range']>> = []
  for (const m of liveMarks(state)) {
    if (m.record.kind !== 'suggested' || m.record.replacement === undefined) continue
    const block = m.record.insert === 'after' || /\n/.test(m.record.replacement)
    out.push(Decoration.widget({ widget: new SuggestionWidget(m.record.id, m.record.replacement, block), side: 1 }).range(m.to))
  }
  return Decoration.set(out, true)
})

export function liveMarks(state: EditorState): LiveMark[] {
  const out: LiveMark[] = []
  state.field(marksField).between(0, state.doc.length, (from, to, d) => {
    out.push({ record: d.spec.record as MarkRecord, from, to })
  })
  return out
}

/** Marks as they should be stored: anchored to the words they cover now. */
export function exportMarks(state: EditorState): MarkRecord[] {
  const text = state.doc.toString()
  return liveMarks(state).map((m) => ({ ...m.record, anchor: makeAnchor(text, m.from, m.to) }))
}

export function marksChanged(tr: Transaction | { startState: EditorState; state: EditorState }): boolean {
  return tr.startState.field(marksField) !== tr.state.field(marksField)
}

let seq = 0
export function newMarkId(): string {
  return `m${Date.now().toString(36)}${(seq++).toString(36)}`
}

/** One unreviewed mark per paragraph of freshly drafted text. */
export function markDraftedParagraphs(view: EditorView, from: number, to: number, file: SceneFile, note: string): void {
  const text = view.state.doc.sliceString(from, to)
  const at = new Date().toISOString()
  const add = paragraphs(text).map((p) => ({
    record: {
      id: newMarkId(),
      kind: 'unreviewed' as MarkKind,
      file,
      anchor: makeAnchor(view.state.doc.toString(), from + p.from, from + p.to),
      origin: { source: 'draft' as const, note, at }
    },
    from: from + p.from,
    to: from + p.to
  }))
  view.dispatch({ effects: addMarks.of(add) })
}

/** Put a suggestion's words into the file. Accepting is reviewing, so no mark stays. */
export function acceptSuggestion(view: EditorView, id: string): void {
  const m = liveMarks(view.state).find((x) => x.record.id === id)
  if (!m || m.record.replacement === undefined) return
  const rep = m.record.replacement
  if (m.record.insert === 'after') {
    const doc = view.state.doc
    const line = doc.lineAt(m.to)
    const atLineEnd = m.to === line.to
    const listy = /^\s*([-*+]|\d+\.)\s/.test(line.text) || /^\s*([-*+]|\d+\.)\s/.test(rep)
    const sep = !atLineEnd ? ' ' : listy ? '\n' : '\n\n'
    view.dispatch({
      changes: { from: m.to, insert: sep + rep },
      effects: removeMark.of(id),
      annotations: machineEdit.of('claude')
    })
  } else {
    view.dispatch({
      changes: { from: m.from, to: m.to, insert: rep },
      effects: removeMark.of(id),
      annotations: machineEdit.of('claude')
    })
  }
}

const ICONS = {
  accept: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reject: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  alt: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 5h8M9 3l2 2-2 2M13 11H5M7 9l-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 014.5 3h7A1.5 1.5 0 0113 4.5v5a1.5 1.5 0 01-1.5 1.5H7l-3 2.5V11h0a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  alert: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3l5.5 10h-11zM8 7v3M8 11.5v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

function describe(rec: MarkRecord): string {
  const when = rec.origin.at ? new Date(rec.origin.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
  const from = rec.origin.note ? `, ${rec.origin.note}` : ''
  const was = rec.kind === 'updated' && rec.acceptedText ? `\nYou accepted: “${rec.acceptedText}”` : ''
  return `${rec.kind}${from}${when ? ` · ${when}` : ''}${was}`
}

/** The sentence around a position, within its paragraph. */
export function sentenceAt(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos)
  const text = line.text
  const rel = pos - line.from
  const re = /[^.!?]*[.!?]+["”’)]*\s*|[^.!?]+$/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0]) break
    const s = m.index
    const e = m.index + m[0].length
    if (rel >= s && rel <= e) {
      const lead = m[0].length - m[0].trimStart().length
      const trail = m[0].length - m[0].trimEnd().length
      return { from: line.from + s + lead, to: line.from + e - trail }
    }
  }
  return { from: line.from, to: line.to }
}

/** The hover window: icon-sized buttons that float at the end of the shade. */
export const markHover = hoverTooltip(
  (view, pos): Tooltip | null => {
    let found: LiveMark | null = null
    view.state.field(marksField).between(pos, pos, (from, to, d) => {
      if (pos >= from && pos <= to) found = { record: d.spec.record as MarkRecord, from, to }
    })
    if (!found) return null
    const mark: LiveMark = found
    const hooks = view.state.facet(editorHooks)
    const isProse = view.dom.classList.contains('ck-editor-prose')
    return {
      pos: mark.to,
      above: false,
      arrow: false,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'ck-hover'
        dom.setAttribute('role', 'group')
        dom.title = describe(mark.record)
        const button = (label: string, icon: string, cls: string, run: () => void): void => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = `ck-hover-btn ${cls}`
          b.setAttribute('aria-label', label)
          b.title = label
          b.innerHTML = icon
          b.addEventListener('mousedown', (e) => e.preventDefault())
          b.addEventListener('click', run)
          dom.appendChild(b)
        }
        const rec = mark.record
        if (rec.kind === 'suggested') {
          button('Accept', ICONS.accept, 'accept', () => acceptSuggestion(view, rec.id))
          button('Reject', ICONS.reject, 'reject', () => view.dispatch({ effects: removeMark.of(rec.id) }))
        } else if (rec.kind === 'conflict') {
          if (rec.alertId && hooks.openAlert) button('Open the alert', ICONS.alert, 'alert', () => hooks.openAlert!(rec.alertId!))
        } else {
          button('Accept', ICONS.accept, 'accept', () => view.dispatch({ effects: removeMark.of(rec.id) }))
          if (isProse && hooks.alternatives) {
            button('Other ways to say this sentence', ICONS.alt, 'alt', () => {
              const s = sentenceAt(view.state, Math.min(Math.max(pos, mark.from), mark.to))
              hooks.alternatives!(view, s.from, s.to)
            })
          }
        }
        if (hooks.attach) button('Talk about this in chat', ICONS.chat, 'chat', () => hooks.attach!(view, mark.from, mark.to))
        // Sit on the last line of the shade, just past its end.
        return { dom, offset: { x: 6, y: -29 } }
      }
    }
  },
  { hoverTime: 250 }
)

export const marksExtension = [marksField, suggestionWidgets, markHover]
