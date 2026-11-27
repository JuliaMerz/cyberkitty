// Prompt caching only works if the cached prefix stays byte-identical. These
// tests pin down that the frozen book snapshot survives ordinary work, that
// the history after it only ever grows (so earlier batches stay cached), and
// that the snapshot is retaken only when it should be.

import { cpSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeAnchor } from '@shared/anchors'
import { describeEdits } from '@shared/edits'
import { jobSystem } from '@shared/briefing'
import { costUsd } from '@shared/pricing'
import { withHistory, writerSystem } from '@shared/prompts'
import type { DocRef, MarkRecord } from '@shared/types'
import { Book } from '../src/main/project'
import { state } from '../src/main/state'
import { bibleStore } from '../src/main/stores'
import { closeBatch, eventsSince, logChanges, logEvent, logSaved, renderBatches, resetLog } from '../src/main/eventlog'
import { addTodo, setAlertStatus } from '../src/main/alerts'
import { bookContextFor, changesTooLarge, COLD_MS, resetSnapshots } from '../src/main/snapshot'

const WRITER = { style: false, notes: true, history: true }
const MIN = 60_000

async function openSample(): Promise<Book> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-cache-'))
  cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
  state.book = new Book(dir)
  resetSnapshots()
  resetLog()
  return state.book
}

async function firstScene(b: Book): Promise<{ id: string; ref: DocRef; prose: string }> {
  const s = (await b.scenes())[0]
  return { id: s.id, ref: { kind: 'scene', sceneId: s.id, file: 'prose' }, prose: s.prose ?? '' }
}

describe('frozen book snapshot with history', () => {
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
    expect(a.snapshot).toContain('<conversation_so_far>')
    expect(a.snapshot).toContain('<open_alerts>')
  })

  it('stays byte-identical through an edit, which arrives as a paragraph in the history', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    expect(first.history).toEqual([])
    const scene = await firstScene(book)
    await book.writeDoc(scene.ref, `${scene.prose.trim()}\n\nA gull landed on the rail.\n`)
    const next = await bookContextFor('writer', WRITER, 2 * MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(next.history).toHaveLength(1)
    expect(next.history[0]).toContain(`Changes in the prose of`)
    expect(next.history[0]).toContain('“A gull landed on the rail.”')
  })

  it('only ever appends to the history, one block per batch', async () => {
    await bookContextFor('writer', WRITER, 0)
    const scene = await firstScene(book)
    await book.writeDoc(scene.ref, `${scene.prose.trim()}\n\nA gull landed on the rail.\n`)
    logEvent('author', 'The author wrote in the chat (on Arrival): What if the gull comes back?')
    const one = await bookContextFor('writer', WRITER, MIN)
    await book.writeDoc(scene.ref, `${scene.prose.trim()}\n\nA gull landed on the rail.\n\nIt came back.\n`)
    const two = await bookContextFor('writer', WRITER, 2 * MIN)
    expect(one.history).toHaveLength(1)
    expect(two.history).toHaveLength(2)
    // The earlier block is untouched, so it is read from cache.
    expect(two.history[0]).toBe(one.history[0])
    expect(two.history[1]).toContain('“It came back.”')
    expect(two.history[1]).not.toContain(': “A gull landed on the rail.”')
  })

  it('logs bible changes and keeps them out of the snapshot', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    await bibleStore.update((all) => [
      ...all,
      { id: 'b-test', type: 'world', subject: 'The ferry', text: 'The ferry has a blue hull.', source: { kind: 'planned' }, updatedAt: '2026-11-27T00:00:00Z' }
    ])
    const next = await bookContextFor('writer', WRITER, MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(next.history.join('\n')).toContain('The story bible changed')
    expect(next.history.join('\n')).toContain('The ferry has a blue hull.')
  })

  it('is retaken once its cache would be cold anyway, folding in the history', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    const scene = await firstScene(book)
    await book.writeDoc(scene.ref, `${scene.prose.trim()}\n\nThe fog lifted.\n`)
    const later = await bookContextFor('writer', WRITER, COLD_MS + MIN)
    expect(later.snapshot).not.toBe(first.snapshot)
    expect(later.snapshot).toContain('The fog lifted.')
    expect(later.history).toEqual([])
  })

  it('stays warm while it keeps being used', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    for (let t = 30; t <= 180; t += 30) {
      expect((await bookContextFor('writer', WRITER, t * MIN)).snapshot).toBe(first.snapshot)
    }
  })

  it('is retaken when the history piles up', async () => {
    const first = await bookContextFor('writer', WRITER, 0)
    const scene = await firstScene(book)
    const long = Array.from({ length: 3000 }, (_, i) => `Sentence number ${i} about the harbour.`).join(' ')
    await book.writeDoc(scene.ref, long)
    const next = await bookContextFor('writer', WRITER, MIN)
    expect(next.snapshot).not.toBe(first.snapshot)
    expect(next.snapshot).toContain('Sentence number 2999')
    expect(next.history).toEqual([])
  })

  it('gives the scan whole current documents instead of history', async () => {
    const scan = { style: false, notes: false }
    const first = await bookContextFor('scan', scan, 0)
    expect(first.snapshot).not.toContain('<notes>')
    const scene = await firstScene(book)
    await book.writeDoc(scene.ref, `${scene.prose.trim()}\n\nThe fog lifted.\n`)
    const next = await bookContextFor('scan', scan, MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(next.changes).toContain(`<scene id="${scene.id}"`)
    expect(next.changes).toContain('The fog lifted.')
  })
})

describe('event log', () => {
  let book: Book
  beforeEach(async () => {
    book = await openSample()
  })

  it('tells accepted suggestions from rejected ones, even when both happen between two looks', async () => {
    await closeBatch()
    const scene = await firstScene(book)
    const text = `${scene.prose.trim()}\n\nThe ferry was late.\n\nThe gulls were loud.\n`
    await book.writeDoc(scene.ref, text)
    await logChanges()
    const late = text.indexOf('The ferry was late.')
    const loud = text.indexOf('The gulls were loud.')
    const mark = (id: string, from: number, to: number, replacement: string): MarkRecord => ({
      id,
      kind: 'suggested',
      file: 'prose',
      anchor: makeAnchor(text, from, to),
      origin: { source: 'rewrite', at: '2026-11-27T00:00:00Z' },
      replacement
    })
    const since = eventsSince(0).length
    const marks = [mark('s1', late, late + 19, 'The ferry ran late.'), mark('s2', loud, loud + 20, 'The gulls screamed.')]
    await book.writeDocMarks(scene.ref, marks)
    // The author accepts the first and rejects the second before the log looks again.
    await book.writeDoc(scene.ref, text.replace('The ferry was late.', 'The ferry ran late.'))
    await book.writeDocMarks(scene.ref, [])
    await logChanges()
    const log = eventsSince(0).slice(since).map((e) => e.text).join('\n')
    expect(log).toContain('accepted a suggestion')
    expect(log).toContain('“The ferry ran late.” in place of “The ferry was late.”')
    expect(log).toContain('did not take a suggestion')
    expect(log).toContain('“The gulls screamed.”')
    // The suggestions were logged as they appeared, too.
    expect(log).toContain('The writer suggested in the prose of')
    expect(log.indexOf('The writer suggested')).toBeLessThan(log.indexOf('accepted a suggestion'))
  })

  it('logs a suggestion made on a document that is not open, and its rejection', async () => {
    await closeBatch()
    const ref = { kind: 'page' as const, name: 'outline.md' as const }
    const text = 'Act one: Mara comes home.\n'
    await book.writeDoc(ref, text)
    await logChanges()
    const since = eventsSince(0).length
    await book.addDocMarks(ref, [
      { id: 'p1', kind: 'suggested', file: 'prose', anchor: makeAnchor(text, 0, 25), origin: { source: 'chat', at: '2026-11-27T00:00:00Z' }, replacement: 'Act one: Mara comes home late.' }
    ])
    await book.writeDocMarks(ref, [])
    await logChanges()
    const fresh = eventsSince(0).slice(since)
    expect(fresh.map((e) => e.text).join('\n')).toContain('The planner suggested in the outline.md page')
    // The planner knows what it suggested; it hears only what the author did with it.
    expect(eventsSince(0, 'planner').slice(-1)[0].text).toContain('The author did not take a suggestion in the outline.md page')
  })

  it('logs a todo added and ticked off between two looks, and who did it', async () => {
    const since = eventsSince(0).length
    await addTodo('Check the ferry times.')
    const todo = eventsSince(0).at(-1)!
    expect(todo.text).toContain('New todo')
    const id = /todo (\S+):/.exec(todo.text)![1]
    await setAlertStatus(id, 'done')
    const fresh = eventsSince(0).slice(since).map((e) => e.text)
    expect(fresh).toHaveLength(2)
    expect(fresh[1]).toContain(`Todo ${id} marked done by the author`)
  })

  it('renders one block per batch, in order', () => {
    resetLog()
    logEvent('author', 'one')
    logEvent('author', 'two')
    expect(renderBatches(eventsSince(0))).toHaveLength(1)
  })

  it('leaves the planner’s own doings out of its view', async () => {
    logEvent('planner', 'The planner replied: hello')
    logEvent('planner', 'The planner: suggested an edit', { via: 'planner' })
    logEvent('author', 'The author wrote in the chat: hi')
    expect(eventsSince(0, 'planner').map((e) => e.text)).toEqual([expect.stringContaining('The author wrote in the chat: hi')])
  })
})

describe('what a snapshot keeps besides the text', () => {
  let book: Book
  beforeEach(async () => {
    book = await openSample()
  })

  it('shows Claude’s unreviewed words and suggestions still waiting', async () => {
    const scene = await firstScene(book)
    const text = `${scene.prose.trim()}\n\nThe ferry was late.\n`
    await book.writeDoc(scene.ref, text)
    const at = text.indexOf('The ferry was late.')
    await book.writeDocMarks(scene.ref, [
      { id: 'u1', kind: 'unreviewed', file: 'prose', anchor: makeAnchor(text, at, at + 19), origin: { source: 'draft', at: '2026-11-27T00:00:00Z' } },
      { id: 's1', kind: 'suggested', file: 'prose', anchor: makeAnchor(text, at, at + 19), origin: { source: 'rewrite', at: '2026-11-27T00:00:00Z' }, replacement: 'The ferry ran late.' }
    ])
    const { snapshot } = await bookContextFor('writer', WRITER, 0)
    expect(snapshot).toContain('<review_state>')
    expect(snapshot).toContain('Claude’s words in the prose, not reviewed yet (from the writer): “The ferry was late.”')
    expect(snapshot).toContain('waiting for the author: “The ferry ran late.” in place of “The ferry was late.”')
  })

  it('keeps recent actions across a restart and a retake', async () => {
    await bookContextFor('writer', WRITER, 0)
    logEvent('author', 'The author asked for a consistency scan of the whole book.')
    logEvent('author', 'The author wrote in the chat (on Arrival): hello', { kind: 'chat' })
    await logSaved()
    // Reopen the book: the log in memory starts over, the file on disk stays.
    state.book = new Book(book.root)
    resetSnapshots()
    resetLog()
    const { snapshot, history } = await bookContextFor('writer', WRITER, 0)
    expect(history).toEqual([])
    expect(snapshot).toContain('<recent_actions>')
    expect(snapshot).toContain('The author asked for a consistency scan of the whole book.')
    // Chat is in the conversation, not repeated as an action.
    expect(snapshot.slice(snapshot.indexOf('<recent_actions>'))).not.toContain('hello')
  })

  it('gives the scan the conversation and the chat since', async () => {
    const scan = { style: false, notes: false, conversation: true }
    const first = await bookContextFor('scan', scan, 0)
    expect(first.snapshot).toContain('<conversation_so_far>')
    logEvent('author', 'The author wrote in the chat (on Arrival): The timeline is told out of order on purpose.', { kind: 'chat' })
    const next = await bookContextFor('scan', scan, MIN)
    expect(next.snapshot).toBe(first.snapshot)
    expect(next.changes).toContain('The timeline is told out of order on purpose.')
  })
})

describe('edits as paragraphs', () => {
  it('gives each changed paragraph as it reads now, with what it replaced', () => {
    const before = '# Arrival\n\nThe ferry was late.\n\nMara stepped off.\n\nThe shed was shut.\n'
    const after = '# Arrival\n\nThe ferry ran an hour late.\n\nMara stepped off.\n\nA gull landed.\n'
    expect(describeEdits(before, after)).toEqual(['- now reads: “The ferry ran an hour late.” (was: “The ferry was late.”)', '- now reads: “A gull landed.” (was: “The shed was shut.”)'])
  })

  it('says where an added paragraph goes and lists removals', () => {
    expect(describeEdits('A.\n\nB.\n', 'A.\n\nNew.\n\nB.\n')).toEqual(['- added after “A.”: “New.”'])
    expect(describeEdits('A.\n\nB.\n', 'B.\n')).toEqual(['- removed: “A.”'])
    expect(describeEdits('', 'First.\n')).toEqual(['- added at the start: “First.”'])
    expect(describeEdits('A.\n', 'A.\n\nB.\n\nC.\n')).toEqual(['- added after “A.”:\n  “B.”\n  “C.”'])
  })

  it('tags paragraphs, for example as Claude’s unreviewed words', () => {
    expect(describeEdits('A.\n', 'A.\n\nB.\n', (p) => (p === 'B.' ? ' [Claude’s words, not reviewed yet]' : ''))).toEqual(['- added after “A.”: “B.” [Claude’s words, not reviewed yet]'])
  })
})

describe('retake threshold', () => {
  it('weighs what follows the snapshot against its size', () => {
    expect(changesTooLarge(5_000, 10_000)).toBe(false)
    expect(changesTooLarge(9_000, 10_000)).toBe(true)
    expect(changesTooLarge(100_000, 600_000)).toBe(false)
    expect(changesTooLarge(130_000, 600_000)).toBe(true)
  })
})

type Block = { cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }

/** At most four breakpoints in a request, and no 1-hour one after a 5-minute one. */
function validBreakpoints(blocks: Block[]): boolean {
  const ttls = blocks.flatMap((b) => (b.cache_control ? [b.cache_control.ttl ?? '5m'] : []))
  const first5m = ttls.indexOf('5m')
  return ttls.length <= 4 && (first5m === -1 || !ttls.slice(first5m).includes('1h'))
}

describe('request blocks', () => {
  it('runs the writer from static to volatile, with the cache point at the end of the history', () => {
    const system = writerSystem('Short sentences.', '<book_snapshot/>')
    const user = withHistory(['<events>a</events>', '<events>b</events>'], '<task>Draft it.</task>')
    expect(system.map((b) => b.cache_control?.ttl ?? '-')).toEqual(['1h', '-', '1h', '1h'])
    expect(user.map((b) => b.cache_control?.ttl ?? '-')).toEqual(['-', '1h', '-'])
    expect(user.at(-1)?.text).toBe('<task>Draft it.</task>')
    expect(validBreakpoints([...system, ...user])).toBe(true)
  })

  it('keeps job prompts and lean writer calls within the rules too', () => {
    expect(validBreakpoints(jobSystem('Do the job.'))).toBe(true)
    expect(validBreakpoints(writerSystem(null))).toBe(true)
    expect(withHistory([], 'task')).toEqual([{ type: 'text', text: 'task' }])
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
