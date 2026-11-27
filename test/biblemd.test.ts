// The story bible as Markdown: what the files look like, how edits made in
// another editor are taken in, and the single-file exports.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { healBible, parseBibleFile, renderBibleFile, type Written } from '@shared/biblemd'
import type { BibleEntry, BibleType } from '@shared/types'
import { Book } from '../src/main/project'
import { state } from '../src/main/state'
import { bibleStore } from '../src/main/stores'
import { saveEntry } from '../src/main/bible'
import { exportMarkdown } from '../src/main/export'

const AT = '2026-11-27T00:00:00.000Z'
const title = (id: string): string => (id.endsWith('arrival') ? 'Arrival' : id)

function entry(id: string, type: BibleType, subject: string, text: string, extra: Partial<BibleEntry> = {}): BibleEntry {
  return { id, type, subject, text, source: { kind: 'text', sceneId: 'manuscript/01-the-harbor/01-arrival', quote: text }, updatedAt: AT, ...extra }
}

const MARA = entry('b1', 'character', 'Mara', 'Has a scar on her left hand.', { storyTime: 'day 1' })
const TOMAS = entry('b2', 'character', 'Tomas', 'Keeps the keys to the ice plant.')
const IDEA = entry('b3', 'character', 'Mara', 'Is afraid of deep water.', { source: { kind: 'idea', status: 'pending' } })
const WALK = entry('b4', 'movement', 'Mara', 'Walks up from the ferry.', { from: 'the harbor', to: 'the house' })

describe('bible files', () => {
  it('reads as plain Markdown, a heading per subject and a bullet per fact, with no ids', () => {
    const { text } = renderBibleFile('character', [MARA, TOMAS, IDEA], title)
    expect(text).toBe('# Characters\n\n## Mara\n\n- Has a scar on her left hand. _(day 1 · from “Arrival”)_\n\n## Tomas\n\n- Keeps the keys to the ice plant. _(from “Arrival”)_\n')
    expect(text).not.toContain('b1')
    // Claude's ideas stay out until kept.
    expect(text).not.toContain('deep water')
  })

  it('parses back what it writes, including a movement’s from and to', () => {
    const { text } = renderBibleFile('movement', [WALK], title)
    expect(parseBibleFile(text)).toEqual([{ subject: 'Mara', text: 'Walks up from the ferry.', from: 'the harbor', to: 'the house', hasMeta: true, line: '- Walks up from the ferry. _(the harbor → the house · from “Arrival”)_' }])
  })

  it('reads any line under a heading as a fact, so nothing the author writes is lost', () => {
    expect(parseBibleFile('# Places\n\nA loose fact.\n\n## The shed\n\nIt leaks.\n* Painted green.\n').map((f) => [f.subject, f.text])).toEqual([
      ['', 'A loose fact.'],
      ['The shed', 'It leaks.'],
      ['The shed', 'Painted green.']
    ])
  })
})

describe('healing against the files', () => {
  let n = 0
  const id = (): string => `new${++n}`
  const files = (md: string): Map<BibleType, string | null> => new Map([['character', md]])
  const start = (): { entries: BibleEntry[]; written: Written; md: string } => {
    const r = renderBibleFile('character', [MARA, TOMAS, IDEA], title)
    return { entries: [MARA, TOMAS, IDEA], written: r.lines, md: r.text }
  }

  it('changes nothing when the file is as it was written', () => {
    const s = start()
    expect(healBible(s.entries, s.written, files(s.md), id).changed).toBe(false)
  })

  it('takes an edited fact as the author’s correction, keeping the old text in its history', () => {
    const s = start()
    const h = healBible(s.entries, s.written, files(s.md.replace('her left hand', 'her right hand')), id, AT)
    const mara = h.entries.find((e) => e.id === 'b1')!
    expect(mara.text).toBe('Has a scar on her right hand.')
    expect(mara.corrected).toBe(true)
    expect(mara.history).toEqual([{ text: 'Has a scar on her left hand.', at: AT }])
    expect(mara.storyTime).toBe('day 1')
  })

  it('adds a new line as the author’s own fact, and removes a deleted one', () => {
    const s = start()
    const md = s.md.replace('- Keeps the keys to the ice plant. _(from “Arrival”)_\n', '').replace('## Tomas\n', '## Tomas\n\n- Never learned to swim.\n')
    const h = healBible(s.entries, s.written, files(md), id, AT)
    expect(h.entries.find((e) => e.id === 'b2')).toBeUndefined()
    const added = h.entries.find((e) => e.text === 'Never learned to swim.')!
    expect(added).toMatchObject({ type: 'character', subject: 'Tomas', source: { kind: 'planned' } })
    // The idea waiting in the app is untouched.
    expect(h.entries.find((e) => e.id === 'b3')).toEqual(IDEA)
  })

  it('follows a fact moved under another heading', () => {
    const s = start()
    const md = '# Characters\n\n## Mara\n\n## Tomas\n\n- Keeps the keys to the ice plant. _(from “Arrival”)_\n- Has a scar on her left hand. _(day 1 · from “Arrival”)_\n'
    const h = healBible(s.entries, s.written, files(md), id, AT)
    expect(h.entries.find((e) => e.id === 'b1')!.subject).toBe('Tomas')
    expect(h.entries).toHaveLength(3)
  })

  it('learns nothing from a missing file, so nothing is deleted', () => {
    const s = start()
    const h = healBible(s.entries, s.written, new Map([['character', null]]), id)
    expect(h.changed).toBe(false)
    expect(h.entries).toHaveLength(3)
  })
})

describe('the bible store on a book', () => {
  let book: Book
  beforeEach(() => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-bible-'))
    cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
    book = new Book(dir)
    state.book = book
  })

  it('writes the files on every change and takes in edits made elsewhere', async () => {
    await bibleStore.update(() => [MARA, TOMAS, IDEA])
    const file = path.join(book.root, 'bible/characters.md')
    expect(readFileSync(file, 'utf8')).toContain('- Has a scar on her left hand.')
    expect(existsSync(path.join(book.root, 'bible/places.md'))).toBe(false)
    // The author edits the file in another editor.
    writeFileSync(file, readFileSync(file, 'utf8').replace('left hand', 'right hand'))
    const after = await bibleStore.read()
    expect(after.find((e) => e.id === 'b1')).toMatchObject({ text: 'Has a scar on her right hand.', corrected: true })
    // Their wording is kept until the app next changes the bible.
    expect(readFileSync(file, 'utf8')).toContain('right hand')
  })

  it('brings a book from before the Markdown bible along', async () => {
    mkdirSync(path.join(book.root, '.cyberkitty'), { recursive: true })
    writeFileSync(path.join(book.root, '.cyberkitty/bible.json'), JSON.stringify([MARA, TOMAS]))
    expect(await bibleStore.read()).toHaveLength(2)
    await bibleStore.update((all) => all)
    expect(readFileSync(path.join(book.root, 'bible/characters.md'), 'utf8')).toContain('## Tomas')
  })

  it('writes a kept idea into the files', async () => {
    await bibleStore.update(() => [MARA, IDEA])
    await saveEntry({ ...IDEA, source: { kind: 'idea', status: 'kept' } })
    expect(readFileSync(path.join(book.root, 'bible/characters.md'), 'utf8')).toContain('- Is afraid of deep water.')
  })
})

describe('export', () => {
  let book: Book
  beforeEach(async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-export-'))
    cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
    book = new Book(dir)
    state.book = book
    const s = (await book.scenes())[0]
    await book.writeDoc({ kind: 'scene', sceneId: s.id, file: 'prose' }, '# Arrival\n\nThe ferry was late.\n')
  })

  it('puts the manuscript in reading order, with chapter headings and no notes', async () => {
    const md = await exportMarkdown(book, 'manuscript')
    expect(md).toMatch(/^# .+\n\n## The Harbor\n\nThe ferry was late\.\n/)
    expect(md).not.toContain('# Arrival')
    expect(md).not.toContain('You look like your mother')
  })

  it('gathers the notes and planning under chapter and scene headings', async () => {
    const md = await exportMarkdown(book, 'notes')
    expect(md).toContain('## Chapter 1: The Harbor')
    expect(md).toContain('### Arrival')
    expect(md).toContain('You look like your mother')
    // A page's own subheadings sit one level under its export heading.
    expect(md).toContain('## Style\n\n### Samples')
    expect(md).not.toContain('The ferry was late.')
  })

  it('collects the bible files', async () => {
    await bibleStore.update(() => [MARA, TOMAS])
    const md = await exportMarkdown(book, 'bible')
    expect(md).toContain('## Characters\n\n### Mara\n\n- Has a scar on her left hand.')
  })
})
