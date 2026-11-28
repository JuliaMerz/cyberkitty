// The book's event log: what happened, in order. Messages, replies, actions
// and edits, each rendered to text once when it is logged and never again, so
// a prompt built from the log stays byte-identical as the log grows. That is
// what lets a call cache everything up to its newest events.
//
// What reaches the log, and how:
// - Actions: every app action the renderer can trigger is in one table
//   (`src/main/actions.ts`); each is logged there or marked quiet, and a test
//   fails if a new one is neither. The planner logs its own chat turns.
// - Edits: not logged per keystroke. Whenever the log is brought up to date
//   (before and after each action, at every call that reads the log, and when
//   work settles), every document is compared with how it read last time and
//   the changed paragraphs are logged in full, with what they replaced. This
//   catches every edit whatever made it: typing, a draft, a merge, a restore,
//   another editor.
// - Marks: every mark write in the app goes through Book.writeDocMarks, which
//   tells the log. A new suggestion is logged when it is written; when one of
//   Claude's marks goes, the comparison logs whether it was taken.
// - Alerts, todos and the bible: every write goes through the store's
//   `update`, which tells the log what it held before and after, so even a
//   todo added and ticked off within seconds is logged.
//
// Events fall into batches. A batch closes whenever a Claude call reads the
// log, so the events between two calls are one content block, and the cache
// lookback (20 blocks) finds the previous call's entry.
//
// The log is also kept on disk, in .cyberkitty/log.jsonl, as the book's
// command history; the most recent actions from it go into each book
// snapshot, so they survive a restart and a retaken snapshot.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describeEdits } from '@shared/edits'
import { DIRECTION_PAGES, docKey, type BibleEntry, type DocRef, type MarkRecord, type PageName } from '@shared/types'
import { bibleLine } from './context'
import { META, markListeners, type Book } from './project'
import { requireBook, state } from './state'
import { alertStore, bibleStore } from './stores'

/** What an event is about. Snapshots use it to pick the recent actions worth keeping. */
export type EventKind = 'chat' | 'reply' | 'action' | 'edit' | 'review' | 'bible' | 'alert' | 'error'

export interface LogEvent {
  seq: number
  batch: number
  at: string
  /** One per time the book was opened, so the file on disk can tell earlier sessions apart. */
  session: string
  who: 'author' | 'planner' | 'writer' | 'app'
  kind: EventKind
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
}

let events: LogEvent[] = []
let seq = 0
let batch = 0
let session = newSession()
let baseline: Baseline | null = null
/** Claude's marks the log knows about, per document: from the last comparison and from every write since. */
let known: Map<string, Map<string, MarkRecord>> | null = null
let earlier: Promise<LogEvent[]> | null = null
let writing: Promise<void> = Promise.resolve()
let comparing: Promise<void> = Promise.resolve()

function newSession(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function resetLog(): void {
  events = []
  seq = 0
  batch = 0
  session = newSession()
  baseline = null
  known = null
  earlier = null
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function logFile(book: Book): string {
  return path.join(book.root, META, 'log.jsonl')
}

/** Add one event. Its text is final: the log is never re-rendered. */
export function logEvent(who: LogEvent['who'], text: string, opts: { kind?: EventKind; via?: 'planner' } = {}): LogEvent {
  const at = new Date()
  const e: LogEvent = { seq: ++seq, batch, at: at.toISOString(), session, who, kind: opts.kind ?? 'action', ...(opts.via ? { via: opts.via } : {}), text: `[${stamp(at)}] ${text.trim()}` }
  events.push(e)
  const book = state.book
  if (book) {
    const file = logFile(book)
    writing = writing.then(() => fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.appendFile(file, JSON.stringify(e) + '\n'))).catch(() => undefined)
  }
  return e
}

/** Resolves once every logged event is on disk. */
export function logSaved(): Promise<void> {
  return writing
}

export function lastSeq(): number {
  return seq
}

const PAGES: PageName[] = ['book.md', ...DIRECTION_PAGES.map((p) => p.name), 'bible.md']

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
  for (const n of await b.notes()) out.push({ ref: { kind: 'note', id: n.id }, label: `the note “${n.title}” (${n.id})`, text: n.text })
  return out
}

function labelOf(ref: DocRef): string {
  const known = baseline?.docs.get(docKey(ref))?.label
  if (known) return known
  if (ref.kind === 'note') return `the note ${ref.id}`
  return ref.kind === 'page' ? `the ${ref.name} page` : ref.kind === 'chapter' ? `the intent of ${ref.chapterId}` : `the ${ref.file} of ${ref.sceneId}`
}

const TRACKED: MarkRecord['kind'][] = ['suggested', 'unreviewed', 'updated']

function tracked(marks: MarkRecord[]): Map<string, MarkRecord> {
  return new Map(marks.filter((m) => TRACKED.includes(m.kind)).map((m) => [m.id, m]))
}

async function readMarks(docs: Doc[]): Promise<Map<string, Map<string, MarkRecord>>> {
  const b = requireBook()
  const marks = new Map<string, Map<string, MarkRecord>>()
  for (const d of docs) marks.set(docKey(d.ref), tracked((await b.readDoc(d.ref)).marks))
  return marks
}

function quoteOf(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`
}

const SUGGESTED_BY: Record<MarkRecord['origin']['source'], { who: LogEvent['who']; name: string }> = {
  chat: { who: 'planner', name: 'The planner' },
  rewrite: { who: 'writer', name: 'The writer' },
  draft: { who: 'writer', name: 'The writer' },
  change: { who: 'writer', name: 'The writer' },
  scan: { who: 'app', name: 'A background check' }
}

/** A mark write, from anywhere in the app. New suggestions are logged as they appear. */
function marksWritten(book: Book, ref: DocRef, marks: MarkRecord[]): void {
  if (book !== state.book || !known) return
  const key = docKey(ref)
  const seen = known.get(key) ?? new Map<string, MarkRecord>()
  known.set(key, seen)
  for (const m of tracked(marks).values()) {
    if (seen.has(m.id)) continue
    seen.set(m.id, m)
    if (m.kind !== 'suggested' || m.replacement === undefined) continue
    const by = SUGGESTED_BY[m.origin.source] ?? SUGGESTED_BY.scan
    const where = m.insert === 'after' ? ` after “${quoteOf(m.anchor.quote, 80)}”` : ` in place of “${quoteOf(m.anchor.quote)}”`
    logEvent(by.who, `${by.name} suggested in ${labelOf(ref)}: “${quoteOf(m.replacement)}”${where}${m.origin.note ? ` (${quoteOf(m.origin.note, 120)})` : ''}. It waits for the author.`, {
      kind: 'review',
      ...(m.origin.source === 'chat' ? { via: 'planner' as const } : {})
    })
  }
}
markListeners.add(marksWritten)

/** Bible entries the log reports: the ones people or the planner wrote, not those settling derives from the text (the edits behind them are logged). */
function bibleLines(all: BibleEntry[]): Map<string, string> {
  return new Map(all.filter((e) => (e.source.kind !== 'text' || e.corrected) && (e.source.kind !== 'idea' || e.source.status !== 'dismissed')).map((e) => [e.id, bibleLine(e)]))
}

bibleStore.listen((before, after) => {
  if (!state.book) return
  const was = bibleLines(before)
  const now = bibleLines(after)
  const lines: string[] = []
  for (const [id, line] of now) if (was.get(id) !== line) lines.push(line)
  for (const [id, line] of was) if (!now.has(id)) lines.push(`- removed: ${line.replace(/^- /, '')}`)
  if (lines.length) logEvent('app', `The story bible changed:\n${lines.join('\n')}`, { kind: 'bible' })
})

alertStore.listen((before, after) => {
  if (!state.book) return
  const was = new Map(before.map((a) => [a.id, a]))
  for (const a of after) {
    const prev = was.get(a.id)
    const what = a.kind === 'todo' ? 'todo' : 'alert'
    if (a.status === 'open' && prev?.status !== 'open') {
      logEvent(prev ? 'author' : 'app', `${prev ? 'Reopened' : 'New'} ${what} ${a.id}${a.kind === 'todo' ? '' : ` (${a.kind})`}: ${a.title}. ${a.explanation}`.trim(), { kind: 'alert' })
    } else if (a.status !== 'open' && prev?.status === 'open') {
      const how = a.statusBy === 'app' ? 'closed itself, since the words it quoted are gone' : a.status === 'dismissed' ? 'dismissed by the author' : 'marked done by the author'
      logEvent(a.statusBy === 'app' ? 'app' : 'author', `${what === 'todo' ? 'Todo' : 'Alert'} ${a.id} ${how}: ${a.title}.`, { kind: 'alert' })
    } else if (!prev && a.status !== 'open') {
      // Added and closed in one write: still worth knowing.
      logEvent('author', `${what === 'todo' ? 'Todo' : 'Alert'} ${a.id} added and closed: ${a.title}.`, { kind: 'alert' })
    }
  }
})

/**
 * Log what changed in the documents since the log last looked: Claude's
 * marks resolved, and edits. Calls run one at a time, so overlapping callers (a Claude
 * call and settling) never log the same change twice, and never throw.
 */
export function logChanges(): Promise<void> {
  // The log never stops the work it records: a failed comparison is retried next time.
  comparing = comparing.then(compare).catch((err: unknown) => console.error('event log:', err))
  return comparing
}

/** Log an action, after the edits that came before it. */
export async function logAction(who: LogEvent['who'], text: string, opts: { kind?: EventKind; via?: 'planner' } = {}): Promise<void> {
  await logChanges()
  logEvent(who, text, opts)
}

async function compare(): Promise<void> {
  const book = state.book
  if (!book) return
  // Marks known before reading: a mark written meanwhile is only reported
  // once a later comparison has seen it on disk.
  const candidates = known ? new Map([...known].map(([k, v]) => [k, new Map(v)])) : null
  // Reading the bible takes in edits made to its Markdown files elsewhere; its listener logs them.
  await bibleStore.read()
  const docs = await readDocs()
  const marks = await readMarks(docs)
  const now: Baseline = { docs: new Map(docs.map((d) => [docKey(d.ref), d])) }
  if (state.book !== book) return
  const before = baseline
  baseline = now
  if (!before || !known || !candidates) {
    known = marks
    return
  }

  // A document that went away while one with the same text appeared was moved or renamed (a note moved, a note turned into a scene).
  const gone = [...before.docs].filter(([key]) => !now.docs.has(key))
  const moved = new Set<string>()

  for (const [key, doc] of now.docs) {
    const current = marks.get(key) ?? new Map<string, MarkRecord>()
    const kept: string[] = []
    for (const [id, m] of candidates.get(key) ?? []) {
      if (current.has(id)) continue
      known.get(key)?.delete(id)
      if (m.kind === 'suggested' && m.replacement !== undefined) {
        const taken = doc.text.includes(m.replacement.trim())
        logEvent('author', `The author ${taken ? 'accepted' : 'did not take'} a suggestion in ${doc.label}: “${quoteOf(m.replacement)}”${m.insert === 'after' ? '' : ` in place of “${quoteOf(m.anchor.quote)}”`}`, { kind: 'review' })
      } else if (doc.text.includes(m.anchor.quote.trim())) {
        // The shade went but the words stayed: accepted as written.
        kept.push(`- “${quoteOf(m.anchor.quote, 80)}”`)
      }
    }
    if (kept.length) logEvent('author', `The author accepted Claude's words as they are in ${doc.label}:\n${kept.join('\n')}`, { kind: 'review' })
    const seen = known.get(key) ?? new Map<string, MarkRecord>()
    for (const [id, m] of current) seen.set(id, m)
    known.set(key, seen)

    const old = before.docs.get(key)
    if (old && old.text === doc.text) continue
    const from = old ? undefined : gone.find(([k, d]) => !moved.has(k) && d.text === doc.text && d.text.trim())
    if (from) {
      moved.add(from[0])
      known.delete(from[0])
      logEvent('author', `Moved: ${from[1].label} is now ${doc.label}, unchanged.`, { kind: 'edit' })
      continue
    }
    const shaded = [...current.values()].filter((m) => m.kind === 'unreviewed' || m.kind === 'updated')
    const tag = (p: string): string => {
      const m = shaded.find((x) => x.anchor.quote.includes(p) || p.includes(x.anchor.quote))
      return m ? (m.kind === 'unreviewed' ? ' [Claude’s words, not reviewed yet]' : ' [changed by Claude since the author accepted it]') : ''
    }
    const changes = describeEdits(old?.text ?? '', doc.text, tag)
    if (changes.length) logEvent('author', `${old ? 'Changes in' : 'New document:'} ${doc.label}:\n${changes.join('\n')}`, { kind: 'edit' })
  }
  for (const [key, old] of before.docs) {
    if (now.docs.has(key) || moved.has(key)) continue
    known.delete(key)
    logEvent('author', `Removed: ${old.label}.`, { kind: 'edit' })
  }
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

/** Kinds that the snapshot's text and conversation do not already show. */
const RECENT_KINDS: EventKind[] = ['action', 'review', 'alert', 'error']

/** The tail of the log on disk from earlier sessions, read once per session. */
function earlierEvents(): Promise<LogEvent[]> {
  const book = state.book
  if (!book) return Promise.resolve([])
  earlier ??= (async () => {
    try {
      const fh = await fs.open(logFile(book), 'r')
      try {
        const { size } = await fh.stat()
        const len = Math.min(size, 256 * 1024)
        const buf = Buffer.alloc(len)
        await fh.read(buf, 0, len, size - len)
        const lines = buf.toString('utf8').split('\n')
        if (len < size) lines.shift()
        const out: LogEvent[] = []
        for (const l of lines) {
          try {
            const e = JSON.parse(l) as LogEvent
            if (e.session !== session && e.kind && RECENT_KINDS.includes(e.kind)) out.push(e)
          } catch {
            // A torn line from a crash: skip it.
          }
        }
        return out
      } finally {
        await fh.close()
      }
    } catch {
      return []
    }
  })()
  return earlier
}

/**
 * The most recent actions up to a point in the log (decisions on Claude's
 * suggestions, requests, alerts), including earlier sessions. A snapshot
 * carries them so a retake or a restart keeps the trail, not just the text.
 */
export async function recentActions(upTo: number, max = 40): Promise<string> {
  const now = events.filter((e) => e.seq <= upTo && RECENT_KINDS.includes(e.kind))
  const list = [...(await earlierEvents()), ...now].slice(-max)
  if (!list.length) return '<recent_actions>(none yet)</recent_actions>'
  return `<recent_actions>\nThe latest actions before this snapshot, oldest first (edits are in the text above, chat in the conversation):\n${list.map((e) => e.text).join('\n')}\n</recent_actions>`
}
