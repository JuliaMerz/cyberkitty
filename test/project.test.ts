import { mkdtempSync, promises as fs, cpSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeAnchor } from '@shared/anchors'
import { Book } from '../src/main/project'
import { History } from '../src/main/history'

function tmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'ck-test-'))
}

describe('Book', () => {
  it('creates a book, chapters and scenes as plain Markdown', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'Test Book')
    const ch = await book.createChapter('The Harbor')
    const sc = await book.createScene(ch, 'Arrival')
    expect(sc).toBe('manuscript/01-the-harbor/01-arrival')
    expect(await fs.readFile(path.join(dir, 'manuscript/01-the-harbor/01-arrival.notes.md'), 'utf8')).toBe('# Arrival\n\n')
    const tree = await book.tree()
    expect(tree.title).toBe('Test Book')
    expect(tree.chapters[0]).toMatchObject({ number: 1, title: 'The Harbor' })
    expect(tree.chapters[0].scenes[0]).toMatchObject({ title: 'Arrival', hasNotes: false, hasProse: false })
  })

  it('reads the sample book', async () => {
    const dir = tmp()
    cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
    const tree = await new Book(dir).tree()
    expect(tree.title).toBe('The Late Ferry')
    expect(tree.chapters[0].scenes.map((s) => s.title)).toEqual(['Arrival', 'The Customs Shed'])
  })

  it('heals sidecar marks against edits made outside the app', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'B')
    const ch = await book.createChapter('One')
    const sc = await book.createScene(ch, 'S')
    const prose = '# S\n\nFirst paragraph by Claude.\n\nSecond paragraph by Claude.\n'
    const ref = { kind: 'scene' as const, sceneId: sc, file: 'prose' as const }
    await book.writeDoc(ref, prose)
    const q = 'Second paragraph by Claude.'
    await book.writeDocMarks(ref, [
      { id: 'x', kind: 'unreviewed', file: 'prose', anchor: makeAnchor(prose, prose.indexOf(q), prose.indexOf(q) + q.length), origin: { source: 'draft', at: '' } }
    ])
    expect((await book.tree()).chapters[0].scenes[0].toReview).toBe(1)
    // Another editor inserts a paragraph above it.
    await fs.writeFile(book.scenePath(sc, 'prose'), '# S\n\nNew opening.\n\n' + prose.slice(4))
    const doc = await book.readDoc(ref)
    expect(doc.marks).toHaveLength(1)
    expect(doc.marks[0].anchor.quote).toBe(q)
    // And then deletes it.
    await fs.writeFile(book.scenePath(sc, 'prose'), '# S\n\nNew opening.\n')
    expect((await book.readDoc(ref)).marks).toHaveLength(0)
  })

  it('survives a corrupt sidecar without losing words', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'B')
    const sc = await book.createScene(await book.createChapter('One'), 'S')
    const ref = { kind: 'scene' as const, sceneId: sc, file: 'notes' as const }
    await fs.mkdir(path.dirname(book.sidecarPath(ref)), { recursive: true })
    await fs.writeFile(book.sidecarPath(ref), '{not json')
    const doc = await book.readDoc(ref)
    expect(doc.text).toBe('# S\n\n')
    expect(doc.marks).toEqual([])
  })

  it('refuses paths outside the book', () => {
    expect(() => new Book('/tmp/book').abs('../etc/passwd')).toThrow()
  })
})

describe('History', () => {
  it('snapshots only when something changed, and records deletions', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'B')
    const sc = await book.createScene(await book.createChapter('One'), 'S')
    const h = new History(dir)
    expect(await h.snapshot('first')).toBeTruthy()
    expect(await h.snapshot('nothing changed')).toBeNull()
    await book.writeDoc({ kind: 'scene', sceneId: sc, file: 'prose' }, '# S\n\nWords.\n')
    expect(await h.snapshot('wrote')).toBeTruthy()
    await fs.rm(book.scenePath(sc, 'prose'))
    expect(await h.snapshot('deleted')).toBeTruthy()
    expect((await h.log()).map((e) => e.message)).toEqual(['deleted', 'wrote', 'first'])
  })

  it('restores an earlier version, and the restore can itself be undone', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'B')
    const sc = await book.createScene(await book.createChapter('One'), 'S')
    const ref = { kind: 'scene' as const, sceneId: sc, file: 'prose' as const }
    const h = new History(dir)
    await book.writeDoc(ref, '# S\n\nFirst version.\n')
    const first = (await h.snapshot('v1'))!
    await book.writeDoc(ref, '# S\n\nSecond version.\n')
    await h.snapshot('v2')
    const touched = await h.restore(first)
    expect(touched).toContain(`${sc}.md`)
    expect((await book.readDoc(ref)).text).toBe('# S\n\nFirst version.\n')
    const log = (await h.log()).map((e) => e.message)
    expect(log[0]).toBe('Restored an earlier version')
    expect(log).toContain('v2')
  })
})
