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
    await book.writeSceneFile(sc, 'prose', prose)
    const q = 'Second paragraph by Claude.'
    await book.writeSidecar(sc, {
      version: 1,
      marks: [
        { id: 'x', kind: 'unreviewed', file: 'prose', anchor: makeAnchor(prose, prose.indexOf(q), prose.indexOf(q) + q.length), origin: { source: 'draft', at: '' } }
      ]
    })
    expect((await book.tree()).chapters[0].scenes[0].toReview).toBe(1)
    // Another editor inserts a paragraph above it.
    await fs.writeFile(book.scenePath(sc, 'prose'), '# S\n\nNew opening.\n\n' + prose.slice(4))
    const scene = await book.readScene(sc)
    expect(scene.sidecar.marks).toHaveLength(1)
    expect(scene.sidecar.marks[0].anchor.quote).toBe(q)
    // And then deletes it.
    await fs.writeFile(book.scenePath(sc, 'prose'), '# S\n\nNew opening.\n')
    expect((await book.readScene(sc)).sidecar.marks).toHaveLength(0)
  })

  it('survives a corrupt sidecar without losing words', async () => {
    const dir = tmp()
    const book = await Book.create(dir, 'B')
    const sc = await book.createScene(await book.createChapter('One'), 'S')
    await fs.mkdir(path.dirname(book.sidecarPath(sc)), { recursive: true })
    await fs.writeFile(book.sidecarPath(sc), '{not json')
    const scene = await book.readScene(sc)
    expect(scene.notes).toBe('# S\n\n')
    expect(scene.sidecar.marks).toEqual([])
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
    await book.writeSceneFile(sc, 'prose', '# S\n\nWords.\n')
    expect(await h.snapshot('wrote')).toBeTruthy()
    await fs.rm(book.scenePath(sc, 'prose'))
    expect(await h.snapshot('deleted')).toBeTruthy()
    expect((await h.log()).map((e) => e.message)).toEqual(['deleted', 'wrote', 'first'])
  })
})
