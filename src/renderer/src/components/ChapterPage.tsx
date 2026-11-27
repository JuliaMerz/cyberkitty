// A chapter: its intent (what the chapter is for), its scenes with their
// summaries, and the way into chapter-scale changes.

import { useEffect, useState } from 'react'
import type { ChangeSpec, ChapterRef, DocRef, SceneSummary } from '@shared/types'
import { useApp } from '../appContext'
import { DocEditor } from './DocEditor'
import { KeyBar, stepTo, useCounts } from './KeyBar'
import { Summary } from './ScenePage'

const ck = window.ck

export function ChapterPage({ chapter, onTree }: { chapter: ChapterRef; onTree: (t: Awaited<ReturnType<typeof ck.getBook>>) => void }): React.JSX.Element {
  const app = useApp()
  const ref: DocRef = { kind: 'chapter', chapterId: chapter.id }
  const [tick, setTick] = useState(0)
  const counts = useCounts([ref], tick)
  const [summaries, setSummaries] = useState<Record<string, SceneSummary>>({})
  const [changes, setChanges] = useState<ChangeSpec[]>([])
  const [request, setRequest] = useState('')
  const [proposing, setProposing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      void ck.getSummaries().then(setSummaries)
      void ck.getChanges().then((c) => setChanges(c.filter((x) => x.chapterId === chapter.id)))
    }
    load()
    return ck.onDataChanged((w) => (w === 'summaries' || w === 'changes') && load())
  }, [chapter.id])

  async function propose(): Promise<void> {
    if (!request.trim()) return
    setProposing(true)
    setError(null)
    const r = await ck.proposeChange(chapter.id, request.trim())
    setProposing(false)
    if (r.ok && r.value) {
      setRequest('')
      app.navigate({ kind: 'change', id: r.value.id })
    } else setError(r.error ?? 'Claude could not write a change spec.')
  }

  const words = chapter.scenes.reduce((n, s) => n + s.words, 0)

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Chapter {chapter.number}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{chapter.title}</span>
        </div>
        <div className="header-right">
          <span className="mono muted">
            {chapter.scenes.length} scene{chapter.scenes.length === 1 ? '' : 's'} · {words.toLocaleString()} words
          </span>
          <button className="btn" onClick={() => void ck.importMarkdownDialog(chapter.id).then((t) => t && onTree(t))}>
            Import Markdown
          </button>
        </div>
      </header>
      <div className="chapter-body">
        <section className="chapter-intent">
          <div className="pane-label">
            <span>chapter.md</span>
            <span>what this chapter is for</span>
          </div>
          <DocEditor
            docRef={ref}
            kind="notes"
            initial={`# ${chapter.title}\n\n`}
            placeholder="What this chapter is for: what changes, whose chapter it is, where it leaves the reader."
            place={{ label: `Chapter ${chapter.number}: ${chapter.title}`, page: 'chapter', chapterId: chapter.id }}
            onUpdate={(u) => (u.docChanged || u.transactions.some((t) => t.effects.length)) && setTick((t) => t + 1)}
            onView={() => setTick((t) => t + 1)}
          />
        </section>
        <section className="chapter-side">
          <h3 className="section-title">Scenes</h3>
          <ol className="scene-cards">
            {chapter.scenes.map((s) => (
              <li key={s.id} className="scene-card">
                <button className="scene-card-title linkish" onClick={() => app.navigate({ kind: 'scene', sceneId: s.id })}>
                  {s.title}
                </button>
                <span className="mono muted">
                  {s.hasProse ? `${s.words.toLocaleString()} words` : s.hasNotes ? 'notes only' : 'empty'}
                  {s.toReview ? ` · ${s.toReview} to review` : ''}
                  {s.conflicts ? ` · ${s.conflicts} conflict${s.conflicts === 1 ? '' : 's'}` : ''}
                </span>
                {summaries[s.id] ? (
                  <p className="scene-card-summary">
                    <Summary summary={summaries[s.id]} onSeen={() => void ck.markSummarySeen(s.id)} />
                  </p>
                ) : (
                  <p className="scene-card-summary muted">{s.hasProse ? 'Claude writes a summary once the scene settles.' : 'No prose yet.'}</p>
                )}
              </li>
            ))}
          </ol>

          <h3 className="section-title">Change the chapter</h3>
          <p className="muted small">
            For changes that span scenes or change what happens. Claude writes a change spec you edit and approve; nothing is rewritten until you say so, and the merge is one undo.
          </p>
          <textarea className="field" rows={3} placeholder="e.g. Mara should already suspect Tom before the customs shed." value={request} onChange={(e) => setRequest(e.target.value)} />
          <div className="row-end">
            {error && <span className="error-text">{error}</span>}
            <button className="btn btn-primary" disabled={!request.trim() || proposing} onClick={() => void propose()}>
              {proposing ? 'Writing the spec…' : 'Propose a change'}
            </button>
          </div>
          {changes.length > 0 && (
            <ul className="change-list">
              {changes.map((c) => (
                <li key={c.id}>
                  <button className="linkish" onClick={() => app.navigate({ kind: 'change', id: c.id })}>
                    {c.title}
                  </button>{' '}
                  <span className="mono muted">{c.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <KeyBar counts={counts} onStep={(k) => stepTo([ref], k)} />
    </main>
  )
}
