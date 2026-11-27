import { useEffect, useRef, useState } from 'react'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import type { ChapterRef, DocRef, DraftResult, SceneSummary, Settings } from '@shared/types'
import { machineEdit, markDraftedParagraphs } from '../editor/marks'
import { useApp } from '../appContext'
import { KeyBar, stepTo, useCounts } from './KeyBar'
import { DocEditor } from './DocEditor'

const ck = window.ck

const NOTES_PLACEHOLDER =
  'Start with set and setting: where and when this happens, who is there, what the place is like.\n\nThen the beats, as rough bullets. A line that is only a quotation is pinned: the draft will use it word for word.'

type View = Settings['sceneView']

interface Props {
  sceneId: string
  title: string
  chapter: ChapterRef | undefined
  view: View
  onViewChange: (v: View) => void
  reveal?: { file: 'prose' | 'notes'; quote: string; n: number } | null
}

interface Notice {
  tone: 'info' | 'warn' | 'error'
  text: string
}

export function ScenePage({ sceneId, title, chapter, view, onViewChange, reveal }: Props): React.JSX.Element {
  const app = useApp()
  const [tick, setTick] = useState(0)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [notesSelection, setNotesSelection] = useState('')
  const [summary, setSummary] = useState<SceneSummary | null>(null)

  const prose = useRef<EditorView | null>(null)
  const lastProseCursor = useRef<number | null>(null)
  const draftState = useRef<{ jobId: string; start: number; pos: number } | null>(null)

  const proseRef: DocRef = { kind: 'scene', sceneId, file: 'prose' }
  const notesRef: DocRef = { kind: 'scene', sceneId, file: 'notes' }
  const refs = view === 'notes' ? [notesRef] : view === 'prose' ? [proseRef] : [proseRef, notesRef]
  const counts = useCounts(refs, tick)
  const place = { label: title, page: 'scene' as const, sceneId, chapterId: chapter?.id }

  useEffect(() => {
    setNotice(null)
    lastProseCursor.current = null
    const load = (): void => void ck.getSummaries().then((s) => setSummary(s[sceneId] ?? null))
    load()
    return ck.onDataChanged((what) => what === 'summaries' && load())
  }, [sceneId])

  // Streamed draft text goes straight into the prose file.
  useEffect(() => {
    const offDelta = ck.onDraftDelta((jobId, text) => {
      const d = draftState.current
      const v = prose.current
      if (!d || d.jobId !== jobId || !v) return
      v.dispatch({ changes: { from: d.pos, insert: text }, annotations: machineEdit.of('claude'), userEvent: 'claude.draft' })
      d.pos += text.length
    })
    const offDone = ck.onDraftDone((jobId, result: DraftResult) => {
      const d = draftState.current
      if (!d || d.jobId !== jobId) return
      draftState.current = null
      setDrafting(null)
      const v = prose.current
      if (v && d.pos > d.start) markDraftedParagraphs(v, d.start, d.pos, 'prose', result.model ? `drafted from notes by ${result.model}` : 'drafted from notes')
      if (!result.ok) setNotice({ tone: result.refused ? 'warn' : 'error', text: result.error ?? 'The draft failed.' })
      else if (result.missingPinned?.length) setNotice({ tone: 'warn', text: `The draft did not use your pinned wording: “${result.missingPinned.join('”, “')}”.` })
      else setNotice(null)
    })
    return () => {
      offDelta()
      offDone()
    }
  }, [])

  const onProseUpdate = (u: ViewUpdate): void => {
    if ((u.selectionSet || u.focusChanged) && u.view.hasFocus) lastProseCursor.current = u.state.selection.main.head
    if (u.docChanged || u.transactions.some((t) => t.effects.length)) setTick((t) => t + 1)
  }
  const onNotesUpdate = (u: ViewUpdate): void => {
    if (u.selectionSet || u.docChanged) {
      const sel = u.state.selection.main
      setNotesSelection(sel.empty ? '' : u.state.sliceDoc(sel.from, sel.to))
    }
    if (u.docChanged || u.transactions.some((t) => t.effects.length)) setTick((t) => t + 1)
  }

  async function draft(): Promise<void> {
    const v = prose.current
    if (!v || drafting) return
    if (view === 'notes') onViewChange('both')
    let beats = notesSelection.trim() ? notesSelection : undefined
    const doc = v.state.doc

    // Where the prose goes: a bracketed gap under the cursor, the cursor, or the end.
    let at = lastProseCursor.current ?? doc.length
    if (at > doc.length) at = doc.length
    const line = doc.lineAt(at)
    const gap = /^\s*\[([^\]\n]+)\]\s*$/.exec(line.text)
    if (gap && lastProseCursor.current !== null) {
      beats = beats ?? gap[1]
      v.dispatch({ changes: { from: line.from, to: line.to }, annotations: machineEdit.of('claude') })
      at = line.from
    } else if (lastProseCursor.current === null || line.text.trim()) {
      at = lastProseCursor.current === null ? doc.length : line.to
    }
    const before = v.state.doc.sliceString(0, at)
    const sep = before.trim() === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    if (sep) v.dispatch({ changes: { from: at, insert: sep }, annotations: machineEdit.of('claude') })
    at += sep.length
    const after = v.state.doc.sliceString(at)
    if (after.trim() && !after.startsWith('\n\n')) v.dispatch({ changes: { from: at, insert: '\n\n' }, annotations: machineEdit.of('claude') })

    setNotice(null)
    const jobId = await ck.draft({ sceneId, beats, proseBefore: v.state.doc.sliceString(0, at), proseAfter: v.state.doc.sliceString(at) })
    draftState.current = { jobId, start: at, pos: at }
    setDrafting(jobId)
  }

  const toReview = counts.unreviewed + counts.updated
  const draftLabel = notesSelection.trim() ? 'Draft selected notes' : 'Draft it'
  const short = sceneId.split('/').pop()

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          {chapter && (
            <button className="crumb-parent linkish" onClick={() => app.navigate({ kind: 'chapter', chapterId: chapter.id })}>
              {chapter.number} · {chapter.title}
            </button>
          )}
          {chapter && <span className="crumb-sep">/</span>}
          <span className="crumb-current">{title}</span>
        </div>
        <div className="segmented" role="tablist" aria-label="Scene view">
          {(['notes', 'both', 'prose'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => onViewChange(v)}>
              {v === 'notes' ? 'Notes' : v === 'both' ? 'Both' : 'Prose'}
            </button>
          ))}
        </div>
        <div className="header-right">
          {toReview > 0 && (
            <button className="chip chip-blue" onClick={() => stepTo(refs, counts.unreviewed ? 'unreviewed' : 'updated')}>
              {toReview} {toReview === 1 ? 'paragraph' : 'paragraphs'} to review
            </button>
          )}
          {counts.conflict > 0 && (
            <button className="chip chip-orange" onClick={() => stepTo(refs, 'conflict')}>
              {counts.conflict} conflict{counts.conflict === 1 ? '' : 's'}
            </button>
          )}
          {drafting ? (
            <button className="btn" onClick={() => ck.cancelDraft(drafting)}>
              <span className="pulse" aria-hidden="true" /> Writing… Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void draft()} title="Claude writes prose from your notes, in your style, into the scene file">
              {draftLabel}
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status">
          <span>{notice.text}</span>
          <button className="notice-x" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <div className={`scene-body view-${view}`}>
        <section className="pane pane-notes" aria-label="Notes" hidden={view === 'prose'}>
          <div className="pane-label">
            <span>{short}.notes.md</span>
            <span>scratchpad</span>
          </div>
          {summary && (
            <div className="scene-summary" title="Claude keeps this summary up to date as the scene settles">
              <span className="mono muted">summary </span>
              <Summary summary={summary} onSeen={() => void ck.markSummarySeen(sceneId)} />
            </div>
          )}
          <DocEditor
            docRef={notesRef}
            kind="notes"
            placeholder={NOTES_PLACEHOLDER}
            place={{ ...place, file: 'notes', label: `${title}, notes` }}
            reveal={reveal?.file === 'notes' ? reveal : null}
            onUpdate={onNotesUpdate}
            onView={() => setTick((t) => t + 1)}
          />
        </section>
        <section className="pane pane-prose" aria-label="Prose" hidden={view === 'notes'}>
          <div className="pane-label">
            <span>{short}.md</span>
            <span>click to type · hover a shade for options · select text for tools</span>
          </div>
          <DocEditor
            docRef={proseRef}
            kind="prose"
            initial={`# ${title}\n\n`}
            place={{ ...place, file: 'prose' }}
            reveal={reveal?.file !== 'notes' ? (reveal ?? null) : null}
            onUpdate={onProseUpdate}
            onView={(v) => {
              prose.current = v
              setTick((t) => t + 1)
            }}
            onExternal={() => setNotice({ tone: 'info', text: 'Picked up changes made outside CyberKitty.' })}
          />
        </section>
      </div>

      <KeyBar counts={counts} onStep={(k) => stepTo(refs, k)} />
    </main>
  )
}

/** A scene summary; sentences that changed since the author last looked are shaded as updated. */
export function Summary({ summary, onSeen }: { summary: SceneSummary; onSeen?: () => void }): React.JSX.Element {
  const parts = summary.text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) ?? [summary.text]
  const changed = new Set(summary.changed.map((s) => s.trim()))
  return (
    <span className="summary-text" onMouseEnter={summary.changed.length ? onSeen : undefined}>
      {parts.map((p, i) => (
        <span key={i} className={changed.has(p.trim()) ? 'ck-mark ck-updated' : undefined}>
          {p}
        </span>
      ))}
    </span>
  )
}
