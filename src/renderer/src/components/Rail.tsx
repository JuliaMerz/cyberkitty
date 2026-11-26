import { useState } from 'react'
import type { BookTree, SpendSummary } from '@shared/types'

export type Place = { kind: 'scene'; sceneId: string } | { kind: 'style' } | { kind: 'settings' }

interface Props {
  tree: BookTree
  place: Place | null
  spend: SpendSummary
  onOpen: (p: Place) => void
  onNewChapter: (title: string) => void
  onNewScene: (chapterId: string, title: string) => void
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="icon">
      <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
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

export function Rail({ tree, place, spend, onOpen, onNewChapter, onNewScene }: Props): React.JSX.Element {
  const currentChapter = place?.kind === 'scene' ? tree.chapters.find((c) => c.scenes.some((s) => s.id === place.sceneId))?.id : undefined
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const pct = spend.capUsd > 0 ? Math.min(100, (spend.todayUsd / spend.capUsd) * 100) : 0

  return (
    <nav className="rail" aria-label="Book">
      <div className="rail-book">
        <div className="rail-title">{tree.title}</div>
        <div className="mono muted">novel in progress</div>
      </div>

      <div className="rail-group">
        <div className="rail-heading">Direction</div>
        <button className={`rail-row${place?.kind === 'style' ? ' current' : ''}`} onClick={() => onOpen({ kind: 'style' })}>
          Style
        </button>
      </div>

      <div className="rail-group">
        <div className="rail-heading">Manuscript</div>
        {tree.chapters.map((c) => {
          const open = !collapsed[c.id] || currentChapter === c.id
          return (
            <div key={c.id}>
              <button className="rail-row rail-chapter" onClick={() => setCollapsed((s) => ({ ...s, [c.id]: open }))} aria-expanded={open}>
                <Chevron open={open} />
                <span>
                  {c.number} · {c.title}
                </span>
              </button>
              {open && (
                <>
                  {c.scenes.map((s) => {
                    const current = place?.kind === 'scene' && place.sceneId === s.id
                    const status = s.toReview
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
        <div className="spend mono">
          <span>Spent today</span>
          <span className="ink">
            ${spend.todayUsd.toFixed(2)} of ${spend.capUsd.toFixed(2)}
          </span>
        </div>
        <div className="meter" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className={`rail-row${place?.kind === 'settings' ? ' current' : ''}`} onClick={() => onOpen({ kind: 'settings' })}>
          Settings
        </button>
      </div>
    </nav>
  )
}
