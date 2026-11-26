// Claude's marks inside an editor. Each mark is a faint shade behind the text.
// Hovering it opens a few icon-sized buttons that float at the end of the
// shade, so nothing on the page moves. Typing inside a mark is the author
// taking the paragraph over, which counts as reviewing it.

import { Annotation, StateEffect, StateField, type EditorState, type Transaction } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, hoverTooltip, type Tooltip } from '@codemirror/view'
import { makeAnchor, paragraphs, type Resolved } from '@shared/anchors'
import type { MarkKind, MarkRecord, SceneFile } from '@shared/types'

/** Annotates transactions made by Claude or by reloading from disk, which never review anything. */
export const machineEdit = Annotation.define<'claude' | 'external'>()

export interface LiveMark {
  record: MarkRecord
  from: number
  to: number
}

export const setMarks = StateEffect.define<Array<{ record: MarkRecord; range: Resolved | { from: number; to: number } }>>()
export const addMarks = StateEffect.define<Array<{ record: MarkRecord; from: number; to: number }>>()
export const removeMark = StateEffect.define<string>()

function deco(record: MarkRecord): Decoration {
  return Decoration.mark({
    class: `ck-mark ck-${record.kind}`,
    attributes: { 'data-mark-id': record.id },
    inclusive: false,
    record
  })
}

export const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let set = value.map(tr.changes)
    if (tr.docChanged && !tr.annotation(machineEdit) && !tr.isUserEvent('undo') && !tr.isUserEvent('redo')) {
      // The author edited inside a mark: the paragraph is now theirs and reviewed.
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
      if (touched.length) set = set.update({ filter: (_f, _t, d) => !touched.includes((d.spec.record as MarkRecord).id) })
    }
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        set = Decoration.set(
          e.value.filter((m) => m.range.from < m.range.to).map((m) => deco(m.record).range(m.range.from, m.range.to)),
          true
        )
      } else if (e.is(addMarks)) {
        set = set.update({
          add: e.value.filter((m) => m.from < m.to).map((m) => deco(m.record).range(m.from, m.to)),
          sort: true
        })
      } else if (e.is(removeMark)) {
        set = set.update({ filter: (_f, _t, d) => (d.spec.record as MarkRecord).id !== e.value })
      }
    }
    return set
  },
  provide: (f) => EditorView.decorations.from(f)
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
export function markDraftedParagraphs(
  view: EditorView,
  from: number,
  to: number,
  file: SceneFile,
  note: string
): void {
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

const ICONS = {
  accept: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reject: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
}

function describe(rec: MarkRecord): string {
  const when = new Date(rec.origin.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const from = rec.origin.note ? `, ${rec.origin.note}` : ''
  return `${rec.kind}${from} · ${when}`
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
        button('Accept', ICONS.accept, 'accept', () => view.dispatch({ effects: removeMark.of(mark.record.id) }))
        // Reject only means something for a suggestion that is not in the file yet.
        if (mark.record.kind === 'suggested') {
          button('Reject', ICONS.reject, 'reject', () => view.dispatch({ effects: removeMark.of(mark.record.id) }))
        }
        // Sit on the last line of the shade, just past its end.
        return { dom, offset: { x: 6, y: -29 } }
      }
    }
  },
  { hoverTime: 250 }
)
