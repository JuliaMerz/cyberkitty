// Notes: the author's scratch work, in a Notes section or woven in among the
// chapters and scenes. Never part of the book, but in Claude's view of it.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeAnchor } from '@shared/anchors'
import type { DocRef, MarkRecord } from '@shared/types'
import { Book } from '../src/main/project'
import { state } from '../src/main/state'
import { closeBatch, eventsSince, logChanges, resetLog } from '../src/main/eventlog'
import { bookContextFor, resetSnapshots } from '../src/main/snapshot'
import { manuscriptMarkdown, notesMarkdown } from '../src/main/export'

const CH = 'manuscript/01-the-harbor'

function openSample(): Book {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-notes-'))
  cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
  state.book = new Book(dir)
  resetSnapshots()
  resetLog()
  return state.book
}

describe('notes on disk', () => {
  let b: Book
  beforeEach(() => {
    b = openSample()
  })

  it('makes notes in the Notes section and in their place among scenes and chapters', async () => {
    const tree0 = await b.tree()
    const [arrival, shed] = tree0.chapters[0].scenes.map((s) => s.id)
    const top = await b.createNote('Ferry timetable', { where: 'notes' })
    const between = await b.createNote('What the shed smells like', { where: 'manuscript', chapterId: CH, after: arrival })
    const first = await b.createNote('Before it all', { where: 'manuscript', chapterId: CH, after: null })
    const later = await b.createNote('After the harbor', { where: 'manuscript', after: CH })
    expect(top).toBe('notes/ferry-timetable.md')
    expect(between).toBe(`${CH}/01n-what-the-shed-smells-like.note.md`)
    expect(first).toBe(`${CH}/00n-before-it-all.note.md`)
    expect(later).toBe('manuscript/01n-after-the-harbor.note.md')
    const tree = await b.tree()
    expect(tree.chapters[0].order).toEqual([first, arrival, between, shed])
    expect(tree.chapters[0].scenes.map((s) => s.id)).toEqual([arrival, shed])
    expect(tree.notes.map((n) => n.title)).toEqual(['Ferry timetable'])
    expect(tree.manuscriptNotes.map((n) => n.id)).toEqual([later])
    expect(tree.order).toEqual([CH, later])
    expect((await b.scenes()).length).toBe(2)
    // A new scene and a new chapter still go last, after the notes.
    const scene = await b.createScene(CH, 'The letter')
    expect((await b.tree()).chapters[0].order.at(-1)).toBe(scene)
    const chapter = await b.createChapter('The island')
    expect((await b.tree()).order).toEqual([CH, later, chapter])
  })

  it('picks up notes made in another editor, in folders, and reads them as notes', async () => {
    mkdirSync(path.join(b.root, 'notes/research'), { recursive: true })
    writeFileSync(path.join(b.root, 'notes/research/tides.md'), '# Tides\n\nSpring tides twice a month.\n')
    writeFileSync(path.join(b.root, `${CH}/01m-obsidian.note.md`), 'Made elsewhere.\n')
    const tree = await b.tree()
    expect(tree.notes.map((n) => [n.id, n.folder, n.title])).toEqual([['notes/research/tides.md', 'notes/research', 'Tides']])
    expect(tree.chapters[0].notes.map((n) => n.title)).toEqual(['Obsidian'])
    expect(b.refForPath(path.join(b.root, 'notes/research/tides.md'))).toEqual({ kind: 'note', id: 'notes/research/tides.md' })
    expect(b.refForPath(path.join(b.root, `${CH}/01m-obsidian.note.md`))).toEqual({ kind: 'note', id: `${CH}/01m-obsidian.note.md` })
    expect(b.refForPath(path.join(b.root, `${CH}/01-arrival.notes.md`))).toEqual({ kind: 'scene', sceneId: `${CH}/01-arrival`, file: 'notes' })
  })

  it('moves a note with its marks, and turns a note into a scene and back', async () => {
    const id = await b.createNote('Options', { where: 'notes' }, 'Option one.\n')
    const ref: DocRef = { kind: 'note', id }
    const text = (await b.readDoc(ref)).text ?? ''
    const i = text.indexOf('Option one.')
    const mark: MarkRecord = { id: 'm1', kind: 'unreviewed', file: 'prose', anchor: makeAnchor(text, i, i + 11), origin: { source: 'chat', at: '2026-11-28T00:00:00Z' } }
    await b.writeDocMarks(ref, [mark])
    const arrival = (await b.tree()).chapters[0].scenes[0].id
    const moved = await b.moveNote(id, { where: 'manuscript', chapterId: CH, after: arrival })
    expect(moved).toBe(`${CH}/01n-options.note.md`)
    expect(existsSync(path.join(b.root, id))).toBe(false)
    expect((await b.readDoc({ kind: 'note', id: moved })).marks.map((m) => m.id)).toEqual(['m1'])

    const sceneId = await b.noteToScene(moved)
    expect(sceneId).toBe(`${CH}/01n-options`)
    const tree = await b.tree()
    expect(tree.chapters[0].scenes.map((s) => s.title)).toEqual(['Arrival', 'Options', 'The Customs Shed'])
    expect(tree.chapters[0].notes).toEqual([])
    const notes = await b.readDoc({ kind: 'scene', sceneId, file: 'notes' })
    expect(notes.text).toContain('Option one.')
    expect(notes.marks.map((m) => [m.id, m.file])).toEqual([['m1', 'notes']])

    const back = await b.sceneToNote(sceneId)
    expect(back).toBe(moved)
    expect((await b.readDoc({ kind: 'note', id: back })).marks.map((m) => m.id)).toEqual(['m1'])
    expect((await b.tree()).chapters[0].scenes.map((s) => s.title)).toEqual(['Arrival', 'The Customs Shed'])
    await b.writeDoc({ kind: 'scene', sceneId: arrival, file: 'prose' }, '# Arrival\n\nThe ferry came in low.\n')
    await expect(b.sceneToNote(arrival)).rejects.toThrow('has prose')
  })

  it('refuses ids that are not notes', async () => {
    expect(() => b.docPath({ kind: 'note', id: 'book.md' })).toThrow()
    expect(() => b.docPath({ kind: 'note', id: 'notes/../book.md' })).toThrow()
    expect(() => b.docPath({ kind: 'note', id: `${CH}/01-arrival.md` })).toThrow()
    await expect(b.noteToScene('notes/x.md')).rejects.toThrow('inside a chapter')
    await expect(b.noteToScene('notes/x.note.md')).rejects.toThrow('inside a chapter')
    await expect(b.noteToScene('manuscript/01n-between.note.md')).rejects.toThrow('inside a chapter')
  })
})

describe('notes and Claude', () => {
  it('are in the snapshot in their place, and their edits and moves are in the log', async () => {
    const b = openSample()
    const arrival = (await b.tree()).chapters[0].scenes[0].id
    await logChanges()
    const id = await b.createNote('Smells', { where: 'manuscript', chapterId: CH, after: arrival }, 'Tar and diesel.\n')
    await b.createNote('Ferry timetable', { where: 'notes' }, 'Twice a day.\n')
    const ctx = await bookContextFor('planner', { style: true, notes: true, history: true }, 0)
    expect(ctx.snapshot).toMatch(/<notes_section>\n<note id="notes\/ferry-timetable.md" title="Ferry timetable">\nTwice a day\./)
    const scene = ctx.snapshot.indexOf(`<scene id="${arrival}"`)
    const note = ctx.snapshot.indexOf(`<note id="${id}" title="Smells">\nTar and diesel.`)
    const next = ctx.snapshot.indexOf('<scene id="manuscript/01-the-harbor/02-the-customs-shed"')
    expect(scene).toBeGreaterThan(0)
    expect(note).toBeGreaterThan(scene)
    expect(next).toBeGreaterThan(note)
    // The scan reads the book without notes.
    const scan = await bookContextFor('scan', { style: false, notes: false, conversation: true }, 0)
    expect(scan.snapshot).not.toContain('<note ')

    await closeBatch()
    const after = eventsSince(0).length
    await b.moveNote(id, { where: 'notes' })
    await logChanges()
    const moved = eventsSince(0).slice(after).map((e) => e.text.replace(/^\[[^\]]*\] /, ''))
    expect(moved).toEqual([`Moved: the note “Smells” (${id}) is now the note “Smells” (notes/smells.md), unchanged.`])
  })

  it('stay out of the manuscript export and are in place in the notes export', async () => {
    const b = openSample()
    const arrival = (await b.tree()).chapters[0].scenes[0].id
    await b.createNote('Smells', { where: 'manuscript', chapterId: CH, after: arrival }, 'Tar and diesel.\n')
    await b.createNote('Ferry timetable', { where: 'notes' }, '## Summer\n\nTwice a day.\n')
    expect(await manuscriptMarkdown(b)).not.toContain('Tar and diesel')
    const md = await notesMarkdown(b)
    expect(md).toContain('## Notes\n\n### Ferry timetable\n\n#### Summer\n\nTwice a day.')
    const a = md.indexOf('### Arrival')
    const n = md.indexOf('### Note: Smells\n\nTar and diesel.')
    const s = md.indexOf('### The Customs Shed')
    expect(a).toBeGreaterThan(0)
    expect(n).toBeGreaterThan(a)
    expect(s).toBeGreaterThan(n)
    expect(readFileSync(path.join(b.root, 'notes/ferry-timetable.md'), 'utf8')).toBe('# Ferry timetable\n\n## Summer\n\nTwice a day.\n')
  })
})

describe('the planner and notes', () => {
  it('starts a note with its words unreviewed, reads and suggests in notes, and files no alerts on them', async () => {
    const { runTool } = await import('../src/main/planner')
    const b = openSample()
    const signal = new AbortController().signal
    const out = await runTool('start_note', { title: 'Three endings', text: 'She stays.\n\nShe leaves on the late ferry.\n\nShe never came.' }, 'c1', signal)
    expect(out.text).toContain('ck:note/notes%2Fthree-endings.md')
    const doc = await b.readDoc({ kind: 'note', id: 'notes/three-endings.md' })
    expect(doc.text).toBe('# Three endings\n\nShe stays.\n\nShe leaves on the late ferry.\n\nShe never came.\n')
    expect(doc.marks.map((m) => [m.kind, m.anchor.quote])).toEqual([
      ['unreviewed', 'She stays.'],
      ['unreviewed', 'She leaves on the late ferry.'],
      ['unreviewed', 'She never came.']
    ])
    const read = await runTool('read_doc', { doc: { note_id: 'notes/three-endings.md' } }, 'c1', signal)
    expect(read.text).toContain('She leaves on the late ferry.')
    await runTool('suggest_edit', { doc: { note_id: 'notes/three-endings.md' }, quote: 'She stays.', replacement: 'She stays, for now.', note: 'softer' }, 'c1', signal)
    expect((await b.readDoc({ kind: 'note', id: 'notes/three-endings.md' })).marks.some((m) => m.kind === 'suggested' && m.replacement === 'She stays, for now.')).toBe(true)
    await expect(
      runTool('file_alert', { kind: 'continuity', title: 'x', explanation: 'x', sides: [{ doc: { note_id: 'notes/three-endings.md' }, quote: 'She stays.' }, { doc: { page: 'summary.md' }, quote: 'Mara' }] }, 'c1', signal)
    ).rejects.toThrow('scratch work')
    await expect(runTool('read_doc', { doc: { note_id: 'book.md' } }, 'c1', signal)).rejects.toThrow('not a note')
  })
})
