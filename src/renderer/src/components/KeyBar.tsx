import { useEffect, useState } from 'react'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { MARK_HELP, MARK_ORDER, type AnyMarkKind, type DocRef } from '@shared/types'
import { editorFor, onEditorsChanged } from '../appContext'
import { liveMarks } from '../editor/marks'
import { banField, countDerived, findGaps } from '../editor/tools'
import { findTells } from '@shared/tells'

export type Counts = Record<AnyMarkKind, number>

export function emptyCounts(): Counts {
  return { unreviewed: 0, updated: 0, suggested: 0, conflict: 0, tell: 0, gap: 0 }
}

/** Live counts of the marks in a page's open editors; re-renders as they change. */
export function useCounts(refs: DocRef[], tick: number): Counts {
  const [, setN] = useState(0)
  useEffect(() => onEditorsChanged(() => setN((n) => n + 1)), [])
  const c = emptyCounts()
  for (const r of refs) {
    const v = editorFor(r)
    if (!v) continue
    for (const m of liveMarks(v.state)) c[m.record.kind]++
    const d = countDerived(v.state, v.dom.classList.contains('ck-editor-prose'))
    c.tell += d.tell
    c.gap += d.gap
  }
  void tick
  return c
}

/** Step to the next mark of a kind across a page's editors, in order. */
export function stepTo(refs: DocRef[], kind: AnyMarkKind): void {
  const views = refs.map(editorFor).filter((v): v is EditorView => Boolean(v) && (v as EditorView).dom.offsetParent !== null)
  const ranges = (v: EditorView): Array<{ from: number; to: number }> => {
    if (kind === 'tell') return findTells(v.state.doc.toString(), v.state.field(banField, false) ?? []).map((t) => ({ from: t.from, to: t.to }))
    if (kind === 'gap') return findGaps(v.state.doc.toString())
    return liveMarks(v.state).filter((m) => m.record.kind === kind)
  }
  const all = views.flatMap((v) => ranges(v).map((r) => ({ v, r })))
  if (!all.length) return
  const focused = views.find((v) => v.hasFocus) ?? views[0]
  const head = focused.state.selection.main.head
  const fi = views.indexOf(focused)
  const next = all.find(({ v, r }) => (views.indexOf(v) === fi && r.from > head) || views.indexOf(v) > fi) ?? all[0]
  next.v.focus()
  next.v.dispatch({ selection: EditorSelection.range(next.r.from, next.r.to), scrollIntoView: true })
}

/** The key: every page lists the same marks in the same order, with counts where they apply. */
export function KeyBar({ counts, onStep }: { counts?: Counts; onStep?: (k: AnyMarkKind) => void }): React.JSX.Element {
  return (
    <footer className="keybar" aria-label="Key to the marks on this page">
      <span className="keybar-title">Key</span>
      {MARK_ORDER.map((k) => (
        <span key={k} className="keybar-item">
          <button type="button" className={`key-swatch ck-${k}`} onClick={() => onStep?.(k)} disabled={!counts?.[k]}>
            {k} {counts ? counts[k] : ''}
          </button>{' '}
          {MARK_HELP[k]}
        </span>
      ))}
      <span className="keybar-item">no shade: yours, or accepted</span>
      {onStep && <span className="keybar-hint">click a name to step through them</span>}
    </footer>
  )
}
