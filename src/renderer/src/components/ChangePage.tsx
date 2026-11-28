// A chapter-scale change: the spec (edit and approve), the rewrite, and the
// review of each scene's changes as paragraph diffs with accept or reject per
// change. Nothing touches the manuscript until the merge, which is one undo.

import { useEffect, useMemo, useState } from 'react'
import type { ChangeSpec, HunkDecision } from '@shared/types'
import { applyChoices, diffParagraphs, splitParagraphs, type Hunk } from '../diff'
import { useApp } from '../appContext'
import { Markdown } from './ChatPane'
import { KeyBar } from './KeyBar'

const ck = window.ck

type Choice = 'take' | 'keep' | 'all'

export function ChangePage({ id }: { id: string }): React.JSX.Element {
  const app = useApp()
  const [change, setChange] = useState<ChangeSpec | null>(null)
  const [spec, setSpec] = useState('')
  const [editing, setEditing] = useState(false)
  const [choices, setChoices] = useState<Record<string, Choice[]>>({})
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    const load = (): void =>
      void ck.getChanges().then((all) => {
        const c = all.find((x) => x.id === id) ?? null
        setChange(c)
        if (c && !editing) setSpec(c.spec)
      })
    load()
    return ck.onDataChanged((w) => w === 'changes' && load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const hunks = useMemo(() => {
    const out: Record<string, Hunk[]> = {}
    for (const s of change?.scenes ?? []) if (s.rewritten !== null) out[s.sceneId] = diffParagraphs(splitParagraphs(s.original), splitParagraphs(s.rewritten))
    return out
  }, [change])

  if (!change) return <main className="page empty-page"><p className="muted">This change is gone.</p></main>

  const choiceFor = (sceneId: string, i: number): Choice | undefined => choices[sceneId]?.[i]
  const setChoice = (sceneId: string, i: number, c: Choice): void => setChoices((cur) => {
    const arr = [...(cur[sceneId] ?? [])]
    arr[i] = c
    return { ...cur, [sceneId]: arr }
  })
  const acceptAll = (): void => {
    const next: Record<string, Choice[]> = {}
    for (const [sid, hs] of Object.entries(hunks)) next[sid] = hs.map((h, i) => (h.kind === 'change' ? (choices[sid]?.[i] ?? 'all') : 'keep'))
    setChoices(next)
  }
  const pending = Object.entries(hunks).reduce((n, [sid, hs]) => n + hs.filter((h, i) => h.kind === 'change' && !choiceFor(sid, i)).length, 0)

  async function merge(): Promise<void> {
    if (!change) return
    setMerging(true)
    const decisions: HunkDecision[] = []
    for (const [sid, hs] of Object.entries(hunks)) {
      const take = hs.map((_h, i) => choiceFor(sid, i) === 'take' || choiceFor(sid, i) === 'all')
      if (!take.some(Boolean)) continue
      const updated: Array<{ text: string; was: string }> = []
      const fresh: string[] = []
      const accepted: string[] = []
      hs.forEach((h, i) => {
        if (h.kind !== 'change') return
        if (choiceFor(sid, i) === 'take') accepted.push(...h.after)
        if (choiceFor(sid, i) !== 'all') return
        // Pair rewritten paragraphs with the ones they replace; extras are new.
        h.after.forEach((p, k) => {
          if (k < h.before.length) updated.push({ text: p, was: k === h.after.length - 1 ? h.before.slice(k).join('\n\n') : h.before[k] })
          else fresh.push(p)
        })
      })
      const original = change.scenes.find((s) => s.sceneId === sid)!.original
      const heading = /^\s*#\s+[^\n]*/.exec(original)?.[0]
      let text = applyChoices(hs, take)
      if (heading && !text.trimStart().startsWith('#')) text = `${heading}\n\n${text}`
      decisions.push({ sceneId: sid, text, updatedParagraphs: updated, newParagraphs: fresh, acceptedParagraphs: accepted })
    }
    await ck.mergeChange(change.id, decisions)
    setMerging(false)
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <button className="crumb-parent linkish" onClick={() => app.navigate({ kind: 'chapter', chapterId: change.chapterId })}>
            Chapter
          </button>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{change.title}</span>
        </div>
        <span className={`chip${change.status === 'review' ? ' chip-blue' : ''}`}>{change.status}</span>
        <div className="header-right">
          {change.status === 'draft' && (
            <>
              <button className="linkish" onClick={() => void ck.saveChange({ ...change, status: 'discarded' })}>
                Discard
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await ck.saveChange({ ...change, spec })
                  setEditing(false)
                  void ck.runChange(change.id)
                }}
              >
                Approve and rewrite
              </button>
            </>
          )}
          {change.status === 'review' && (
            <>
              {pending > 0 && <span className="mono muted">{pending} change{pending === 1 ? '' : 's'} to decide</span>}
              <button className="btn" onClick={acceptAll} title="Everything you have not decided comes in marked, so you can still review it on the page: updated where it rewrites your text, unreviewed where it is new">
                Accept all
              </button>
              <button className="btn btn-primary" disabled={merging} onClick={() => void merge()}>
                {merging ? 'Merging…' : 'Merge into the book'}
              </button>
            </>
          )}
          {change.status === 'merged' && (
            <button className="btn" onClick={() => void ck.undoChange(change.id)}>
              Undo the whole change
            </button>
          )}
        </div>
      </header>
      <div className="scroll-page change">
        <section className="change-spec">
          <div className="row-between">
            <h3 className="section-title">Change spec</h3>
            {change.status === 'draft' && (
              <button className="linkish small" onClick={() => setEditing((e) => !e)}>
                {editing ? 'Preview' : 'Edit'}
              </button>
            )}
          </div>
          {editing ? (
            <textarea className="field spec-edit" value={spec} onChange={(e) => setSpec(e.target.value)} onBlur={() => void ck.saveChange({ ...change, spec })} />
          ) : (
            <div className="spec-view">
              <Markdown text={spec || change.spec} />
            </div>
          )}
        </section>
        {change.status === 'rewriting' && (
          <section>
            {change.scenes.map((s) => (
              <p key={s.sceneId} className="mono muted">
                {s.title}: {s.status === 'writing' ? 'the writer is rewriting…' : s.status}
              </p>
            ))}
          </section>
        )}
        {(change.status === 'review' || change.status === 'merged') &&
          change.scenes.map((s) => (
            <section key={s.sceneId} className="change-scene">
              <h3 className="section-title">
                <button className="linkish" onClick={() => app.navigate({ kind: 'scene', sceneId: s.sceneId })}>
                  {s.title}
                </button>
              </h3>
              {s.status === 'error' && <p className="error-text">{s.error}</p>}
              {(hunks[s.sceneId] ?? []).map((h, i) =>
                h.kind === 'same' ? (
                  <p key={i} className="diff-same">
                    {h.before.length} paragraph{h.before.length === 1 ? '' : 's'} unchanged
                  </p>
                ) : (
                  <div key={i} className={`diff-hunk ${choiceFor(s.sceneId, i) ?? ''}`}>
                    {h.before.map((p, j) => (
                      <p key={`b${j}`} className="diff-del">
                        {p}
                      </p>
                    ))}
                    {h.after.map((p, j) => (
                      <p key={`a${j}`} className="diff-add ck-mark ck-suggested">
                        {p}
                      </p>
                    ))}
                    {change.status === 'review' && (
                      <div className="diff-actions">
                        <button className={`btn small${choiceFor(s.sceneId, i) === 'take' ? ' on' : ''}`} onClick={() => setChoice(s.sceneId, i, 'take')}>
                          Accept
                        </button>
                        <button className={`btn small${choiceFor(s.sceneId, i) === 'keep' ? ' on' : ''}`} onClick={() => setChoice(s.sceneId, i, 'keep')}>
                          Keep mine
                        </button>
                        {choiceFor(s.sceneId, i) === 'all' && <span className="mono muted">accepted with all; lands as updated, or unreviewed if new</span>}
                      </div>
                    )}
                  </div>
                )
              )}
            </section>
          ))}
      </div>
      <KeyBar />
    </main>
  )
}
