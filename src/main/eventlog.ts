// The book's event log: what happened, in order. Messages, replies, actions
// and edits, each rendered to text once when it is logged and never again, so
// a prompt built from the log stays byte-identical as the log grows. That is
// what lets a call cache everything up to its newest events.
//
// Events fall into batches. A batch closes whenever a Claude call reads the
// log, so the events between two calls are one content block, and the cache
// lookback (20 blocks) finds the previous call's entry.
//
// Edits are not logged per keystroke. Whenever the log is brought up to date
// (a Claude call, or the pause that triggers settling), every document is
// compared with how it read last time and the changed paragraphs are logged
// in full, with what they replaced. The log is also kept on disk, in
// .cyberkitty/log.jsonl, as the book's command history.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describeEdits } from '@shared/edits'
import { DIRECTION_PAGES, docKey, type Alert, type DocRef, type MarkRecord, type PageName } from '@shared/types'
import { bibleLine } from './context'
import { META } from './project'
import { requireBook, state } from './state'
import { alertStore, bibleStore } from './stores'

export interface LogEvent {
  seq: number
  batch: number
  at: string
  who: 'author' | 'planner' | 'writer' | 'app'
  /** Caused by the planner's own tools: it already knows, so its view leaves these out. */
  via?: 'planner'
  text: string
}

interface Doc {
  ref: DocRef
  label: string
  text: string
}

interface Baseline {
  docs: Map<string, Doc>
  bible: Map<string, string>
  alerts: Map<string, Alert>
  /** Claude's marks seen in each document, to tell later whether they were accepted. */
  marks: Map<string, Map<string, MarkRecord>>
}

let events: LogEvent[] = []
let seq = 0
let batch = 0
let baseline: Baseline | null = null
let writing: Promise<void> = Promise.resolve()
let comparing: Promise<void> = Promise.resolve()

export function resetLog(): void {
  events = []
  seq = 0
  batch = 0
  baseline = null
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Add one event. Its text is final: the log is never re-rendered. */
export function logEvent(who: LogEvent['who'], text: string, via?: 'planner'): LogEvent {
  const at = new Date()
  const e: LogEvent = { seq: ++seq, batch, at: at.toISOString(), who, ...(via ? { via } : {}), text: `[${stamp(at)}] ${text.trim()}` }
  events.push(e)
  if (state.book) {
    const file = path.join(state.book.root, META, 'log.jsonl')
    writing = writing.then(() => fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.appendFile(file, JSON.stringify(e) + '\n'))).catch(() => undefined)
  }
  return e
}

export function lastSeq(): number {
  return seq
}

const PAGES: PageName[] = [...DIRECTION_PAGES.map((p) => p.name), 'bible.md']

async function readDocs(): Promise<Doc[]> {
  const b = requireBook()
  const out: Doc[] = []
  for (const name of PAGES) out.push({ ref: { kind: 'page', name }, label: `the ${name} page`, text: await b.readPage(name) })
  const tree = await b.tree()
  const scenes = await b.scenes()
  for (const c of tree.chapters) {
    out.push({ ref: { kind: 'chapter', chapterId: c.id }, label: `the intent of chapter ${c.number}, “${c.title}” (${c.id})`, text: (await b.readText(`${c.id}/chapter.md`)) ?? '' })
    for (const s of scenes.filter((x) => x.chapterId === c.id)) {
      out.push({ ref: { kind: 'scene', sceneId: s.id, file: 'notes' }, label: `the notes of “${s.title}” (${s.id})`, text: s.notes ?? '' })
      out.push({ ref: { kind: 'scene', sceneId: s.id, file: 'prose' }, label: `the prose of “${s.title}” (${s.id})`, text: s.prose ?? '' })
    }
  }
  return out
}

const TRACKED: MarkRecord['kind'][] = ['suggested', 'unreviewed', 'updated']

async function claudeMarks(ref: DocRef): Promise<Map<string, MarkRecord>> {
  const marks = (await requireBook().readDoc(ref)).marks.filter((m) => TRACKED.includes(m.kind))
  return new Map(marks.map((m) => [m.id, m]))
}

async function readBaseline(): Promise<Baseline> {
  const docs = await readDocs()
  const marks = new Map<string, Map<string, MarkRecord>>()
  for (const d of docs) marks.set(docKey(d.ref), await claudeMarks(d.ref))
  return {
    docs: new Map(docs.map((d) => [docKey(d.ref), d])),
    bible: new Map((await bibleStore.read()).filter((e) => e.source.kind !== 'idea' || e.source.status !== 'dismissed').map((e) => [e.id, bibleLine(e)])),
    alerts: new Map((await alertStore.read()).map((a) => [a.id, a])),
    marks
  }
}

/** Marks Claude added while the log was not looking (they are noticed when they go). */
export function noteMarks(ref: DocRef, marks: MarkRecord[]): void {
  const seen = baseline?.marks.get(docKey(ref))
  if (!seen) return
  for (const m of marks) if (TRACKED.includes(m.kind)) seen.set(m.id, m)
}

function quoteOf(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`
}

/**
 * Log what changed since the log last looked: Claude's marks resolved, edits,
 * the bible, alerts. Calls run one at a time, so overlapping callers (a Claude
 * call and settling) never log the same change twice, and never throw.
 */
export function logChanges(): Promise<void> {
  // The log never stops the work it records: a failed comparison is retried next time.
  comparing = comparing.then(compare).catch((err: unknown) => console.error('event log:', err))
  return comparing
}

/** Log an action, after the edits that came before it. */
export async function logAction(who: LogEvent['who'], text: string): Promise<void> {
  await logChanges()
  logEvent(who, text)
}

async function compare(): Promise<void> {
  if (!state.book) return
  if (!baseline) {
    baseline = await readBaseline()
    return
  }
  const before = baseline
  const now = await readBaseline()

  for (const [key, doc] of now.docs) {
    const seen = before.marks.get(key)
    const current = now.marks.get(key) ?? new Map()
    if (seen) {
      const kept: string[] = []
      for (const [id, m] of seen) {
        if (current.has(id)) continue
        if (m.kind === 'suggested' && m.replacement !== undefined) {
          const taken = doc.text.includes(m.replacement.trim())
          logEvent('author', `The author ${taken ? 'accepted' : 'did not take'} a suggestion in ${doc.label}: “${quoteOf(m.replacement)}”${m.insert === 'after' ? '' : ` in place of “${quoteOf(m.anchor.quote)}”`}`)
        } else if (doc.text.includes(m.anchor.quote.trim())) {
          // The shade went but the words stayed: accepted as written.
          kept.push(`- “${quoteOf(m.anchor.quote, 80)}”`)
        }
      }
      if (kept.length) logEvent('author', `The author accepted Claude's words as they are in ${doc.label}:\n${kept.join('\n')}`)
    }
    const old = before.docs.get(key)
    if (old && old.text === doc.text) continue
    const marks = [...current.values()].filter((m) => m.kind === 'unreviewed' || m.kind === 'updated')
    const tag = (p: string): string => {
      const m = marks.find((x) => x.anchor.quote.includes(p) || p.includes(x.anchor.quote))
      return m ? (m.kind === 'unreviewed' ? ' [Claude’s words, not reviewed yet]' : ' [changed by Claude since the author accepted it]') : ''
    }
    const changes = describeEdits(old?.text ?? '', doc.text, tag)
    if (changes.length) logEvent('author', `${old ? 'Changes in' : 'New document:'} ${doc.label}:\n${changes.join('\n')}`)
  }
  for (const [key, old] of before.docs) if (!now.docs.has(key)) logEvent('author', `Removed: ${old.label}.`)

  const bible: string[] = []
  for (const [id, line] of now.bible) if (before.bible.get(id) !== line) bible.push(line)
  for (const id of before.bible.keys()) if (!now.bible.has(id)) bible.push(`- removed: entry ${id}`)
  if (bible.length) logEvent('app', `The story bible changed:\n${bible.join('\n')}`)

  for (const [id, a] of now.alerts) {
    const was = before.alerts.get(id)
    if (a.status === 'open' && was?.status !== 'open') logEvent('app', `Alert ${id} opened (${a.kind}): ${a.title}. ${a.explanation}`)
    if (a.status !== 'open' && was?.status === 'open') logEvent(a.status === 'dismissed' ? 'author' : 'app', `Alert ${id} ${a.status === 'dismissed' ? 'dismissed by the author' : 'closed'}: ${a.title}.`)
  }

  baseline = now
}

/** Bring the log up to date and start a new batch: called by every call that reads the log. */
export async function closeBatch(): Promise<void> {
  await logChanges()
  if (events.at(-1)?.batch === batch) batch++
}

export function eventsSince(after: number, view: 'all' | 'planner' = 'all'): LogEvent[] {
  return events.filter((e) => e.seq > after && (view === 'all' || (e.who !== 'planner' && e.via !== 'planner')))
}

/** One text per batch, in order: the content blocks of a prompt's history. */
export function renderBatches(list: LogEvent[]): string[] {
  const out: string[] = []
  let cur: number | null = null
  for (const e of list) {
    if (e.batch !== cur) {
      out.push('')
      cur = e.batch
    }
    out[out.length - 1] += (out[out.length - 1] ? '\n' : '') + e.text
  }
  return out.map((t) => `<events>\n${t}\n</events>`)
}
