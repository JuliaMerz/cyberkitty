// The story bible: what is true in the story. Most of it comes from the text
// automatically; the author can correct any entry, plan entries by hand, and
// keep or dismiss Claude's ideas. The timeline and character paths are views
// of the same entries.

import { useEffect, useMemo, useState } from 'react'
import { BIBLE_TYPES, type BibleEntry, type BibleType } from '@shared/types'
import { useApp } from '../appContext'
import { DocPage } from './DocPage'
import { KeyBar } from './KeyBar'

const ck = window.ck

function useBible(): BibleEntry[] {
  const [entries, setEntries] = useState<BibleEntry[]>([])
  useEffect(() => {
    const load = (): void => void ck.getBible().then(setEntries)
    load()
    return ck.onDataChanged((w) => w === 'bible' && load())
  }, [])
  return entries
}

export function BiblePage({ focusId }: { focusId?: string }): React.JSX.Element {
  const app = useApp()
  const entries = useBible()
  const [tab, setTab] = useState<'entries' | 'planned'>('entries')
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (focusId) document.getElementById(`bible-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [focusId, entries.length])

  if (tab === 'planned') {
    return <DocPage name="bible.md" extra={<Tabs tab={tab} setTab={setTab} />} />
  }

  const shown = entries.filter((e) => !(e.source.kind === 'idea' && e.source.status === 'dismissed'))
  const f = filter.trim().toLowerCase()
  const match = (e: BibleEntry): boolean => !f || e.subject.toLowerCase().includes(f) || e.text.toLowerCase().includes(f)
  const ideas = shown.filter((e) => e.source.kind === 'idea' && e.source.status === 'pending')

  function save(e: BibleEntry): void {
    void ck.saveBibleEntry({ ...e, text: draft.trim() || e.text })
    setEditing(null)
  }

  const row = (e: BibleEntry): React.JSX.Element => {
    const idea = e.source.kind === 'idea' && e.source.status === 'pending'
    return (
      <li key={e.id} id={`bible-${e.id}`} className={`bible-entry${focusId === e.id ? ' focus' : ''}`}>
        <span className="bible-subject">{e.subject}</span>
        {editing === e.id ? (
          <span className="bible-edit">
            <input className="field" autoFocus value={draft} onChange={(x) => setDraft(x.target.value)} onKeyDown={(x) => x.key === 'Enter' && save(e)} />
            <button className="btn" onClick={() => save(e)}>
              Save
            </button>
          </span>
        ) : (
          <span className={idea ? 'ck-mark ck-unreviewed' : undefined} title={e.history?.length ? `Was: ${e.history.at(-1)!.text}` : undefined}>
            {e.text}
            {e.storyTime ? <span className="mono muted"> · {e.storyTime}</span> : null}
          </span>
        )}
        <span className="bible-actions">
          {e.corrected && <span className="mono muted" title="You corrected this; settling leaves it alone">corrected</span>}
          {e.history?.length ? <span className="mono muted" title={e.history.map((h) => h.text).join('\n')}>changed</span> : null}
          {e.source.kind === 'text' && (
            <button className="linkish small" onClick={() => app.navigate({ kind: 'scene', sceneId: (e.source as { sceneId: string }).sceneId, quote: (e.source as { quote: string }).quote })}>
              {app.sceneTitle(e.source.sceneId)}
            </button>
          )}
          {e.source.kind === 'planned' && <span className="mono muted">planned</span>}
          {idea ? (
            <>
              <button className="btn small" onClick={() => void ck.saveBibleEntry({ ...e, source: { kind: 'idea', status: 'kept', chatId: (e.source as { chatId?: string }).chatId } })}>
                Keep
              </button>
              <button className="btn small" onClick={() => void ck.saveBibleEntry({ ...e, source: { kind: 'idea', status: 'dismissed' } })}>
                Dismiss
              </button>
            </>
          ) : (
            <button
              className="linkish small"
              onClick={() => {
                setEditing(e.id)
                setDraft(e.text)
              }}
            >
              Correct
            </button>
          )}
        </span>
      </li>
    )
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Book</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">Story bible</span>
        </div>
        <Tabs tab={tab} setTab={setTab} />
        <div className="header-right">
          <input className="field search" placeholder="Filter by name or fact" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn" onClick={() => void ck.settleNow()} title="Catch up on everything written since the last time">
            Update from the text
          </button>
        </div>
      </header>
      <div className="page-hint">Taken from the text as your work settles, with no approval needed: the text already says it. Correct anything and the correction sticks. Claude’s own ideas wait as unreviewed until you keep or dismiss them. The bible is also plain Markdown in the book’s bible folder, one file per kind; edits made there count too.</div>
      <div className="scroll-page">
        {ideas.length > 0 && (
          <section>
            <h3 className="section-title">Claude’s ideas</h3>
            <ul className="bible-list">{ideas.filter(match).map(row)}</ul>
          </section>
        )}
        {BIBLE_TYPES.map(({ type, title }) => {
          const list = shown.filter((e) => e.type === type && !(e.source.kind === 'idea' && e.source.status === 'pending') && match(e))
          if (!list.length) return null
          const bySubject = groupBy(list, (e) => e.subject)
          return (
            <section key={type}>
              <h3 className="section-title">{title}</h3>
              {[...bySubject.entries()].map(([subject, items]) => (
                <div key={subject} className="bible-group">
                  <ul className="bible-list">{items.map(row)}</ul>
                </div>
              ))}
            </section>
          )
        })}
        {!shown.length && <p className="muted empty-note">Nothing yet. Once a scene has prose and you pause, Claude fills this in from the text.</p>}
      </div>
      <KeyBar />
    </main>
  )
}

function Tabs({ tab, setTab }: { tab: 'entries' | 'planned'; setTab: (t: 'entries' | 'planned') => void }): React.JSX.Element {
  return (
    <div className="segmented" role="tablist">
      <button role="tab" aria-selected={tab === 'entries'} className={tab === 'entries' ? 'on' : ''} onClick={() => setTab('entries')}>
        From the text
      </button>
      <button role="tab" aria-selected={tab === 'planned'} className={tab === 'planned' ? 'on' : ''} onClick={() => setTab('planned')}>
        Planned (bible.md)
      </button>
    </div>
  )
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return m
}

/** The timeline: events in story order, and each character's path through places. */
export function TimelinePage(): React.JSX.Element {
  const app = useApp()
  const entries = useBible()
  const events = useMemo(() => entries.filter((e) => e.type === 'event').sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9)), [entries])
  const moves = useMemo(() => entries.filter((e) => e.type === 'movement').sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9)), [entries])
  const paths = groupBy(moves, (m) => m.subject)

  const go = (e: BibleEntry): void => {
    if (e.source.kind === 'text') app.navigate({ kind: 'scene', sceneId: e.source.sceneId, quote: e.source.quote })
    else app.navigate({ kind: 'bible', id: e.id })
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Book</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">Timeline</span>
        </div>
        <div className="header-right">
          <button className="btn" onClick={() => app.navigate({ kind: 'diagrams' })}>
            Maps and diagrams
          </button>
        </div>
      </header>
      <div className="page-hint">Story order, not page order. Updated from the text as you write. Click an event to go to the words that establish it.</div>
      <div className="scroll-page timeline">
        <section>
          <h3 className="section-title">Events</h3>
          {events.length ? (
            <ol className="timeline-list">
              {events.map((e) => (
                <li key={e.id} className={e.source.kind === 'idea' ? 'idea' : undefined}>
                  <span className="mono timeline-time">{e.storyTime || '—'}</span>
                  <button className="timeline-event linkish" onClick={() => go(e)}>
                    <strong>{e.subject}</strong> {e.text}
                  </button>
                  {e.source.kind === 'text' && <span className="mono muted">{app.sceneTitle(e.source.sceneId)}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No events yet.</p>
          )}
        </section>
        <section>
          <h3 className="section-title">Character paths</h3>
          {paths.size ? (
            [...paths.entries()].map(([who, ms]) => (
              <div key={who} className="path">
                <strong>{who}</strong>
                <div className="path-steps">
                  {ms.map((m, i) => (
                    <button key={m.id} className="path-step linkish" onClick={() => go(m)} title={m.text}>
                      {i === 0 && m.from ? `${m.from} → ` : '→ '}
                      {m.to || m.text}
                      {m.storyTime ? <span className="mono muted"> ({m.storyTime})</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No movements yet.</p>
          )}
        </section>
      </div>
      <KeyBar />
    </main>
  )
}

export function bibleTypeTitle(t: BibleType): string {
  return BIBLE_TYPES.find((x) => x.type === t)?.title ?? t
}
