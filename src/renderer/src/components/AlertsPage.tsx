// Alerts: a todo list in book order. Each conflict shows both sides quoted,
// side by side, each a link to the words. Dismissing sticks to that exact
// pair; fixing the words closes an alert by itself.

import { useEffect, useState } from 'react'
import { ALERT_KIND_TITLES, type Alert, type BookTree, type DocRef, type JobStatus, type NavTarget } from '@shared/types'
import { linkFor } from '@shared/links'
import { useApp } from '../appContext'
import { KeyBar } from './KeyBar'

const ck = window.ck

function navFor(ref: DocRef, quote: string): NavTarget {
  if (ref.kind === 'scene') return { kind: 'scene', sceneId: ref.sceneId, file: ref.file, quote }
  if (ref.kind === 'chapter') return { kind: 'chapter', chapterId: ref.chapterId }
  if (ref.kind === 'note') return { kind: 'note', id: ref.id, quote }
  return { kind: 'page', name: ref.name, quote }
}

export function AlertsPage({ tree, focusId, job }: { tree: BookTree; focusId?: string; job: JobStatus | null }): React.JSX.Element {
  const app = useApp()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [show, setShow] = useState<'open' | 'dismissed' | 'done'>('open')
  const [todo, setTodo] = useState('')

  useEffect(() => {
    const load = (): void => void ck.getAlerts().then(setAlerts)
    load()
    return ck.onDataChanged((w) => w === 'alerts' && load())
  }, [])

  useEffect(() => {
    if (focusId) document.getElementById(`alert-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [focusId, alerts.length])

  const list = alerts.filter((a) => a.status === show)
  const order = tree.chapters.flatMap((c) => c.scenes.map((s) => s.id))
  const groups: Array<{ title: string; items: Alert[] }> = []
  const bookWide = list.filter((a) => !a.sceneId || !order.includes(a.sceneId))
  if (bookWide.length) groups.push({ title: 'Book-wide', items: bookWide })
  for (const id of order) {
    const items = list.filter((a) => a.sceneId === id)
    if (items.length) groups.push({ title: app.sceneTitle(id), items })
  }

  function ask(a: Alert): void {
    void ck.sendChat(`Help me fix this alert: [${a.title}](${linkFor({ kind: 'alert', id: a.id })}). ${a.explanation}`, { label: 'Alerts', page: 'alerts' }, a.sides.map((s) => ({ ref: s.ref, quote: s.quote, label: s.label })))
  }

  const count = (s: Alert['status']): number => alerts.filter((a) => a.status === s).length

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Book</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">Alerts</span>
        </div>
        <div className="segmented" role="tablist">
          {(['open', 'done', 'dismissed'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={show === s} className={show === s ? 'on' : ''} onClick={() => setShow(s)}>
              {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'Dismissed'} {count(s)}
            </button>
          ))}
        </div>
        <div className="header-right">
          {job?.id === 'scan' && <span className="mono muted">{job.label}</span>}
          <button className="btn" disabled={job?.id === 'scan' && job.state === 'running'} onClick={() => void ck.scanNow()} title="Claude reads the whole book once and files what no longer fits">
            Scan the book now
          </button>
        </div>
      </header>
      <div className="page-hint">The whole book is read for inconsistencies when you leave a chapter or pause for a while. Every alert quotes the words on both sides; fix either one and the alert closes itself.</div>
      <div className="scroll-page">
        <form
          className="todo-add"
          onSubmit={(e) => {
            e.preventDefault()
            if (!todo.trim()) return
            void ck.addTodo(todo.trim())
            setTodo('')
          }}
        >
          <input className="field" placeholder="Add a todo, e.g. plant the knife in chapter 3" value={todo} onChange={(e) => setTodo(e.target.value)} />
          <button className="btn" type="submit" disabled={!todo.trim()}>
            Add
          </button>
        </form>
        {!list.length && <p className="muted empty-note">{show === 'open' ? 'Nothing open. ' : 'Nothing here.'}</p>}
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="section-title">{g.title}</h3>
            {g.items.map((a) => (
              <article key={a.id} id={`alert-${a.id}`} className={`alert-card kind-${a.kind}${focusId === a.id ? ' focus' : ''}`}>
                <div className="alert-head">
                  <span className={`mono alert-kind${['continuity', 'timeline', 'direction'].includes(a.kind) ? ' conflict' : ''}`}>{ALERT_KIND_TITLES[a.kind]}</span>
                  <strong>{a.title}</strong>
                </div>
                {a.explanation && <p className="alert-why">{a.explanation}</p>}
                {a.sides.length > 0 && (
                  <div className={`alert-sides n${a.sides.length}`}>
                    {a.sides.map((s, i) => (
                      <button key={i} className="alert-side" onClick={() => app.navigate(navFor(s.ref, s.quote))}>
                        <span className="mono muted">{s.label}</span>
                        <span className={['continuity', 'timeline', 'direction'].includes(a.kind) ? 'ck-mark ck-conflict' : undefined}>“{s.quote}”</span>
                      </button>
                    ))}
                  </div>
                )}
                {a.fix && <p className="alert-fix">Fix: {a.fix}</p>}
                <div className="alert-actions">
                  {a.status === 'open' ? (
                    <>
                      {a.kind === 'idea' && a.bibleId ? (
                        <button className="btn small" onClick={() => app.navigate({ kind: 'bible', id: a.bibleId })}>
                          Keep or dismiss in the bible
                        </button>
                      ) : (
                        <button className="btn small" onClick={() => void ck.setAlertStatus(a.id, 'done')}>
                          Done
                        </button>
                      )}
                      {a.kind !== 'todo' && a.kind !== 'idea' && (
                        <button className="btn small" onClick={() => ask(a)}>
                          Ask Claude
                        </button>
                      )}
                      <button className="linkish small" onClick={() => void ck.setAlertStatus(a.id, 'dismissed')} title="Dismissed alerts are not raised again for the same words">
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <button className="linkish small" onClick={() => void ck.setAlertStatus(a.id, 'open')}>
                      Reopen
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      <KeyBar />
    </main>
  )
}
