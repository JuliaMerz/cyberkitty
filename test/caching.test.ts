// Prompt caching only works if the cached prefix stays byte-identical. These
// tests pin down that the frozen book snapshot survives ordinary work (edits,
// new bible entries, chat) and is retaken only when it should be.

import { cpSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { Book } from '../src/main/project'
import { state } from '../src/main/state'
import { bibleStore, chatStore } from '../src/main/stores'
import { bookContextFor, changesTooLarge, COLD_MS, resetSnapshots, writerBookContext } from '../src/main/snapshot'
import { writerSystem } from '@shared/prompts'
import { jobSystem } from '@shared/briefing'
import { costUsd } from '@shared/pricing'

const WRITER = { style: false, notes: true }
const MIN = 60_000

async function openSample(): Promise<Book> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-cache-'))
  cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
  state.book = new Book(dir)
  resetSnapshots()
  return state.book
}

async function firstScene(b: Book): Promise<{ id: string; prose: string }> {
  const s = (await b.scenes())[0]
  return { id: s.id, prose: s.prose ?? '' }
}

describe('frozen book snapshot', () => {
  let book: Book
  beforeEach(async () => {
    book = await openSample()
  })

  it('has no timestamps or other per-call bytes', async () => {
    const a = await bookContextFor('writer', WRITER, 0)
    resetSnapshots()
    const b = await bookContextFor('writer', WRITER, 5 * MIN)
    expect(b.snapshot).toBe(a.snapshot)
    expect(a.snapshot).not.toMatch(/taken=|\d{4}-\d\d-\d\dT\d\d:/)
  })

  it('stays byte-identical through a prose edit and sends the new text after it', async () => {
    const t0 = 0
    const first = await bookContextFor('writer', WRITER, t0)
    const scene = await firstScene(book)
    await book.writeDoc({ kind: 'scene', sceneId: scene.id, file: 'prose' }, `${scene.prose.trim()}\n\nA gull landed on the rail.\n`)
    const next = await bookContextFor('writer', WRITER, t0 + 2 * MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(first.snapshot).not.toContain('A gull landed on the rail.')
    expect(next.changes).toContain('A gull landed on the rail.')
    expect(next.changes).toContain('replaces what the snapshot shows')
    expect(next.changes).toContain(`<scene id="${scene.id}"`)
  })

  it('stays byte-identical through new bible entries and chat', async () => {
    const first = await bookContextFor('writer', WRITER)
    await bibleStore.update((all) => [
      ...all,
      { id: 'b-test', type: 'world', subject: 'The ferry', text: 'The ferry has a blue hull.', source: { kind: 'planned' }, updatedAt: '2026-11-27T00:00:00Z' }
    ])
    await chatStore.update((all) => [...all, { id: 'c-test', role: 'author', text: 'What if the gull comes back?', at: '2026-11-27T00:00:00Z' }])
    const ctx = await writerBookContext()
    expect(ctx.snapshot).toBe(first.snapshot)
    expect(ctx.tail).toContain('<bible_changes>')
    expect(ctx.tail).toContain('The ferry has a blue hull.')
    expect(ctx.tail).toContain('What if the gull comes back?')
  })

  it('reports nothing changed when nothing did', async () => {
    await bookContextFor('writer', WRITER, 0)
    const again = await bookContextFor('writer', WRITER, MIN)
    expect(again.changes).toContain('nothing has changed')
  })

  it('lists a new scene and the contents as they are now', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    const chapter = (await book.tree()).chapters[0].id
    const id = await book.createScene(chapter, 'Fog', '# Fog\n\n- Fog rolls in.\n')
    const next = await bookContextFor('writer', WRITER, MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(next.changes).toContain(`<scene id="${id}"`)
    expect(next.changes).toContain('<contents_now>')
  })

  it('is retaken once its cache would be cold anyway', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    const scene = await firstScene(book)
    await book.writeDoc({ kind: 'scene', sceneId: scene.id, file: 'prose' }, `${scene.prose.trim()}\n\nThe fog lifted.\n`)
    const later = await bookContextFor('writer', WRITER, COLD_MS + MIN)
    expect(later.snapshot).not.toBe(first.snapshot)
    expect(later.snapshot).toContain('The fog lifted.')
    expect(later.changes).toContain('nothing has changed')
  })

  it('stays warm while it keeps being used', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    for (let t = 30; t <= 180; t += 30) {
      expect((await bookContextFor('writer', WRITER, t * MIN)).snapshot).toBe(first.snapshot)
    }
  })

  it('is retaken when the changes pile up', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    const scene = await firstScene(book)
    const long = Array.from({ length: 3000 }, (_, i) => `Sentence number ${i} about the harbour.`).join(' ')
    await book.writeDoc({ kind: 'scene', sceneId: scene.id, file: 'prose' }, long)
    const next = await bookContextFor('writer', WRITER, MIN)
    expect(next.snapshot).not.toBe(first.snapshot)
    expect(next.snapshot).toContain('Sentence number 2999')
  })

  it('keeps one snapshot per role', async () => {
    const writer = await bookContextFor('writer', WRITER, 0)
    const scan = await bookContextFor('scan', { style: false, notes: false }, 0)
    expect(scan.snapshot).not.toBe(writer.snapshot)
    expect(scan.snapshot).not.toContain('<notes>')
  })
})

describe('retake threshold', () => {
  it('weighs the changes against the size of the snapshot', () => {
    expect(changesTooLarge(5_000, 10_000)).toBe(false)
    expect(changesTooLarge(9_000, 10_000)).toBe(true)
    expect(changesTooLarge(100_000, 600_000)).toBe(false)
    expect(changesTooLarge(130_000, 600_000)).toBe(true)
  })
})

type Block = { cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }

/** At most four breakpoints, and every 1-hour one before any 5-minute one. */
function validBreakpoints(blocks: Block[]): boolean {
  const ttls = blocks.flatMap((b) => (b.cache_control ? [b.cache_control.ttl ?? '5m'] : []))
  const first5m = ttls.indexOf('5m')
  return ttls.length <= 4 && (first5m === -1 || !ttls.slice(first5m).includes('1h'))
}

describe('system blocks', () => {
  it('orders the writer from static to volatile, within the breakpoint rules', () => {
    const sys = writerSystem('Short sentences.', [{ before: 'She felt sad.', after: 'She sat.' }], { snapshot: '<book_snapshot/>', tail: '<changed_since_snapshot/>' })
    expect(sys.map((b) => b.cache_control?.ttl ?? (b.cache_control ? '5m' : '-'))).toEqual(['1h', '-', '1h', '1h', '5m'])
    expect(sys[2].text).toContain('Short sentences.')
    expect(sys[2].text).not.toContain('She sat.')
    expect(sys[3].text).toBe('<book_snapshot/>')
    expect(sys[4].text).toContain('<changed_since_snapshot/>')
    expect(sys[4].text).toContain('She sat.')
    expect(validBreakpoints(sys)).toBe(true)
  })

  it('keeps job prompts within the rules too', () => {
    expect(validBreakpoints(jobSystem('Do the job.'))).toBe(true)
    expect(validBreakpoints(writerSystem(null))).toBe(true)
  })
})

describe('pricing', () => {
  it('charges 1-hour cache writes at twice the input price and 5-minute ones at 1.25x', () => {
    const usd = costUsd('claude-sonnet-5-5', {
      cache_creation_input_tokens: 2_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 1_000_000 }
    })
    expect(usd).toBeCloseTo(2 * 2 + 2 * 1.25)
  })
})
