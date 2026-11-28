import { useState } from 'react'
import { DIRECTION_PAGES, NOTES_DIR, type BookTree, type JobStatus, type NotePlace, type NoteRef, type SpendSummary } from '@shared/types'
import type { Route } from '../App'

interface Props {
  tree: BookTree
  route: Route | null
  spend: SpendSummary
  job: JobStatus | null
  chatOpen: boolean
  onOpen: (r: Route) => void
  onNewChapter: (title: string) => void
  onNewScene: (chapterId: string, title: string) => void
  onNewNote: (title: string, place: NotePlace) => void
  onToggleChat: () => void
  onNewBook: () => void
  onOpenBook: () => void
  onCloseBook: () => void
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="icon">
      <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
    </svg>
  )
}

/** The glyph that marks a note: a page with a folded corner. */
export function NoteGlyph(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className="icon note-glyph">
      <path d="M4 2.5h5.5L12.5 5.5v8H4z M9.5 2.5v3h3 M6 8.5h4.5 M6 11h3" />
    </svg>
  )
}

function Plus(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="icon">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

/** A one-line title field that replaces a "New …" row while typing. */
function NewItem({ label, indent, onCreate }: { label: string; indent?: boolean; onCreate: (title: string) => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  if (!editing) {
    return (
      <button className={`rail-row rail-new${indent ? ' indent' : ''}`} onClick={() => setEditing(true)}>
        <Plus />
        <span>{label}</span>
      </button>
    )
  }
  const done = (): void => {
    if (value.trim()) onCreate(value.trim())
    setValue('')
    setEditing(false)
  }
  return (
    <input
      autoFocus
      className={`rail-input${indent ? ' indent' : ''}`}
      placeholder="Title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') {
          setValue('')
          setEditing(false)
        }
      }}
    />
  )
}

export function Rail({ tree, route, spend, job, chatOpen, onOpen, onNewChapter, onNewScene, onNewNote, onToggleChat, onNewBook, onOpenBook, onCloseBook }: Props): React.JSX.Element {
  const currentChapter =
    route?.kind === 'scene'
      ? tree.chapters.find((c) => c.scenes.some((s) => s.id === route.sceneId))?.id
      : route?.kind === 'chapter'
        ? route.chapterId
        : route?.kind === 'note'
          ? tree.chapters.find((c) => c.notes.some((n) => n.id === route.id))?.id
          : undefined
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const pct = spend.capUsd > 0 ? Math.min(100, (spend.todayUsd / spend.capUsd) * 100) : 0
  const is = (kind: Route['kind'], extra?: (r: Route) => boolean): boolean => route?.kind === kind && (!extra || extra(route))

  // A note: a quieter row with a note glyph and no status.
  const noteRow = (n: NoteRef, indent: boolean): React.JSX.Element => {
    const current = route?.kind === 'note' && route.id === n.id
    return (
      <button
        key={n.id}
        className={`rail-row rail-note${indent ? ' indent' : ''}${current ? ' current' : ''}`}
        onClick={() => onOpen({ kind: 'note', id: n.id })}
        aria-current={current ? 'page' : undefined}
        title={n.id}
      >
        <NoteGlyph />
        <span className="rail-scene-title">{n.title}</span>
      </button>
    )
  }
  const folders = [...new Set(tree.notes.map((n) => n.folder))]

  const row = (label: string, r: Route, current: boolean, badge?: React.ReactNode): React.JSX.Element => (
    <button key={label} className={`rail-row${current ? ' current' : ''}`} onClick={() => onOpen(r)} aria-current={current ? 'page' : undefined}>
      <span className="rail-scene-title">{label}</span>
      {badge}
    </button>
  )

  return (
    <nav className="rail" aria-label="Book">
      <div className="rail-book">
        <div className="rail-title">{tree.title}</div>
        <div className="rail-book-actions">
          <button className="linkish small" onClick={onNewBook} title="Create a new book (File menu, Ctrl+Shift+N)">
            New book
          </button>
          <button className="linkish small" onClick={onOpenBook} title="Open another book folder (Ctrl+O)">
            Open…
          </button>
          <button className="linkish small" onClick={onCloseBook} title="Close this book and go back to the start screen">
            Close
          </button>
        </div>
      </div>

      <div className="rail-group">
        <div className="rail-heading">Direction</div>
        {DIRECTION_PAGES.map((p) =>
          row(
            p.title,
            { kind: 'page', name: p.name },
            is('page', (r) => r.kind === 'page' && r.name === p.name),
            p.name === 'outline.md' && tree.divergedOutline ? <span className="mono rail-status orange">{tree.divergedOutline} diverged</span> : undefined
          )
        )}
      </div>

      <div className="rail-group rail-notes">
        <div className="rail-heading">Notes</div>
        {folders.map((f) => (
          <div key={f} className="rail-folder">
            {f !== NOTES_DIR && <div className="rail-subheading">{f.slice(NOTES_DIR.length + 1)}</div>}
            {tree.notes.filter((n) => n.folder === f).map((n) => noteRow(n, f !== NOTES_DIR))}
          </div>
        ))}
        <NewItem label="New note" onCreate={(t) => onNewNote(t, { where: 'notes' })} />
      </div>

      <div className="rail-group">
        <div className="rail-heading">Book</div>
        {row('Story bible', { kind: 'bible' }, is('bible'))}
        {row('Timeline', { kind: 'timeline' }, is('timeline'))}
        {row('Alerts', { kind: 'alerts' }, is('alerts'), tree.openAlerts ? <span className="mono rail-status orange">{tree.openAlerts}</span> : undefined)}
        {row('Maps and diagrams', { kind: 'diagrams' }, is('diagrams'))}
        {row('History', { kind: 'history' }, is('history'))}
      </div>

      <div className="rail-group rail-manuscript">
        <div className="rail-heading">Manuscript</div>
        {tree.order.map((id) => {
          const c = tree.chapters.find((x) => x.id === id)
          if (!c) {
            const n = tree.manuscriptNotes.find((x) => x.id === id)
            return n ? noteRow(n, false) : null
          }
          const open = !collapsed[c.id] || currentChapter === c.id
          const chapterCurrent = route?.kind === 'chapter' && route.chapterId === c.id
          return (
            <div key={c.id}>
              <div className={`rail-row rail-chapter${chapterCurrent ? ' current' : ''}`}>
                <button className="rail-chev" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => setCollapsed((s) => ({ ...s, [c.id]: open }))}>
                  <Chevron open={open} />
                </button>
                <button className="rail-chapter-title" onClick={() => onOpen({ kind: 'chapter', chapterId: c.id })}>
                  {c.number} · {c.title}
                </button>
              </div>
              {open && (
                <>
                  {c.order.map((item) => {
                    const s = c.scenes.find((x) => x.id === item)
                    if (!s) {
                      const n = c.notes.find((x) => x.id === item)
                      return n ? noteRow(n, true) : null
                    }
                    const current = route?.kind === 'scene' && route.sceneId === s.id
                    const status = s.conflicts
                      ? { text: `${s.conflicts} conflict${s.conflicts === 1 ? '' : 's'}`, cls: 'orange' }
                      : s.toReview
                        ? { text: `${s.toReview} to review`, cls: 'blue' }
                        : s.hasProse
                          ? { text: 'drafted', cls: '' }
                          : s.hasNotes
                            ? { text: 'notes only', cls: '' }
                            : { text: 'empty', cls: '' }
                    return (
                      <button
                        key={s.id}
                        className={`rail-row indent${current ? ' current' : ''}`}
                        onClick={() => onOpen({ kind: 'scene', sceneId: s.id })}
                        aria-current={current ? 'page' : undefined}
                      >
                        <span className="rail-scene-title">{s.title}</span>
                        <span className={`mono rail-status ${status.cls}`}>{status.text}</span>
                      </button>
                    )
                  })}
                  <NewItem label="New scene" indent onCreate={(t) => onNewScene(c.id, t)} />
                </>
              )}
            </div>
          )
        })}
        <NewItem label="New chapter" onCreate={onNewChapter} />
      </div>

      <div className="rail-foot">
        {job && job.state === 'running' && (
          <div className="rail-job mono" title={job.detail}>
            <span className="pulse" aria-hidden="true" /> {job.label}
          </div>
        )}
        {job && job.state === 'error' && (
          <div className="rail-job mono error-text" title={job.detail}>
            {job.label}
          </div>
        )}
        <div className="spend mono">
          <span>Spent today</span>
          <span className="ink">
            ${spend.todayUsd.toFixed(2)} of ${spend.capUsd.toFixed(2)}
          </span>
        </div>
        <div className="meter" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="rail-foot-row">
          <button className={`rail-row${route?.kind === 'settings' ? ' current' : ''}`} onClick={() => onOpen({ kind: 'settings' })}>
            Settings
          </button>
          <button className={`rail-row${chatOpen ? ' current' : ''}`} onClick={onToggleChat}>
            Chat
          </button>
        </div>
      </div>
    </nav>
  )
}
