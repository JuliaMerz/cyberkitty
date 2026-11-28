// A note: the author's scratch work, in one editor like a direction page. It
// can sit in the Notes section or among the chapters and scenes, moves between
// them, and a note inside a chapter can become a scene.

import { useState } from 'react'
import { NOTES_DIR, type BookTree, type DocRef, type NotePlace, type NoteRef } from '@shared/types'
import { useApp } from '../appContext'
import { DocEditor } from './DocEditor'
import { KeyBar, stepTo, useCounts } from './KeyBar'

const ck = window.ck

interface Option {
  label: string
  place: NotePlace
}

/** Every spot a note can go, in book order, leaving out where it is now. */
function destinations(tree: BookTree, self: NoteRef): Array<{ group: string; options: Option[] }> {
  const title = (id: string): string =>
    tree.chapters.find((c) => c.id === id)?.title ??
    tree.chapters.flatMap((c) => c.scenes).find((s) => s.id === id)?.title ??
    [...tree.manuscriptNotes, ...tree.chapters.flatMap((c) => c.notes)].find((n) => n.id === id)?.title ??
    id
  const groups: Array<{ group: string; options: Option[] }> = []
  if (!self.folder.startsWith(NOTES_DIR)) groups.push({ group: 'Notes', options: [{ label: 'The Notes section', place: { where: 'notes' } }] })

  // Between chapters: before the first, or after any chapter or note there.
  const order = tree.order.filter((id) => id !== self.id)
  const top: Option[] = [
    { label: 'Before the first chapter', place: { where: 'manuscript', after: null } },
    ...order.map((id) => ({ label: `After “${title(id)}”`, place: { where: 'manuscript', after: id } as NotePlace }))
  ]
  groups.push({ group: 'Between chapters', options: top.filter((o) => !(self.folder === 'manuscript' && isHere(tree.order, self.id, o.place))) })

  for (const c of tree.chapters) {
    const items = c.order.filter((id) => id !== self.id)
    const options: Option[] = [{ label: 'At the start', place: { where: 'manuscript', chapterId: c.id, after: null } }]
    for (const id of items) options.push({ label: `After “${title(id)}”`, place: { where: 'manuscript', chapterId: c.id, after: id } })
    groups.push({ group: `Chapter ${c.number}: ${c.title}`, options: options.filter((o) => !(self.folder === c.id && isHere(c.order, self.id, o.place))) })
  }
  return groups.filter((g) => g.options.length)
}

/** Whether a place is where the note already is. */
function isHere(order: string[], self: string, place: NotePlace): boolean {
  if (place.where !== 'manuscript') return false
  const i = order.indexOf(self)
  return (i === 0 ? null : order[i - 1]) === place.after
}

export function NotePage({ note, tree, reveal, onTree }: { note: NoteRef; tree: BookTree; reveal?: { quote: string; n: number } | null; onTree: (t: BookTree) => void }): React.JSX.Element {
  const app = useApp()
  const ref: DocRef = { kind: 'note', id: note.id }
  const [tick, setTick] = useState(0)
  const counts = useCounts([ref], tick)
  const [error, setError] = useState<string | null>(null)
  const chapter = tree.chapters.find((c) => c.id === note.folder)
  const groups = destinations(tree, note)
  const where = chapter ? `Chapter ${chapter.number} · ${chapter.title}` : note.folder === 'manuscript' ? 'Manuscript' : 'Notes'
  const sub = note.folder.startsWith(`${NOTES_DIR}/`) ? note.folder.slice(NOTES_DIR.length + 1) : null

  async function move(value: string): Promise<void> {
    if (!value) return
    setError(null)
    try {
      const r = await ck.moveNote(note.id, JSON.parse(value) as NotePlace)
      onTree(r.tree)
      app.navigate({ kind: 'note', id: r.noteId })
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    }
  }

  async function toScene(): Promise<void> {
    setError(null)
    try {
      const r = await ck.noteToScene(note.id)
      onTree(r.tree)
      app.navigate({ kind: 'scene', sceneId: r.sceneId })
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          {chapter ? (
            <button className="crumb-parent linkish" onClick={() => app.navigate({ kind: 'chapter', chapterId: chapter.id })}>
              {where}
            </button>
          ) : (
            <span className="crumb-parent">{where}</span>
          )}
          {sub && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-parent">{sub}</span>
            </>
          )}
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{note.title}</span>
        </div>
        <div className="header-right">
          <select className="note-move" aria-label="Move this note" value="" onChange={(e) => void move(e.target.value)}>
            <option value="">Move to…</option>
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={JSON.stringify(o.place)} value={JSON.stringify(o.place)}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {chapter && (
            <button className="btn" onClick={() => void toScene()} title="Make this note the notes of a new scene, in the same place, ready for beats and Draft it">
              Turn into a scene
            </button>
          )}
        </div>
      </header>
      <div className="page-hint">
        <span className="mono">{note.id.split('/').pop()}</span> · Scratch work, never part of the book. Claude reads it, but takes no facts from it and raises no alerts against it.
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="single-pane">
        <DocEditor
          docRef={ref}
          kind="page"
          initial={`# ${note.title}\n\n`}
          place={{ label: `${note.title} (a note)`, page: 'note', noteId: note.id }}
          reveal={reveal}
          onUpdate={(u) => (u.docChanged || u.transactions.some((t) => t.effects.length)) && setTick((t) => t + 1)}
          onView={() => setTick((t) => t + 1)}
        />
      </div>
      <KeyBar counts={counts} onStep={(k) => stepTo([ref], k)} />
    </main>
  )
}
