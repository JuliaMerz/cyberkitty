// Frozen book snapshots, for prompt caching.
//
// Caching is a prefix match: a single changed byte invalidates everything
// after it. The book changes all the time, so each Claude role keeps a frozen
// copy of the whole book in its cached prefix (1-hour TTL). After it comes
// what happened since: for the writer and the planner, the event log
// (messages, actions, paragraph edits; see eventlog.ts), which only ever
// grows; for the scan, the current text of each changed document. The
// snapshot is retaken when that pile gets large, or when its cache has gone
// cold anyway (no call for most of an hour), so a fresh copy costs nothing
// extra.
//
// The book is split into units (a page, a chapter intent, a scene, a note, a
// bible entry). A unit's rendered text is what the snapshot shows and what the diff
// compares, so "changed" means exactly "renders differently".

import { DIRECTION_PAGES, type DocRef, type PageName } from '@shared/types'
import { filledStyle } from '@shared/style'
import { bibleLine, chatText, openAlertsText, reviewStateText } from './context'
import { closeBatch, eventsSince, lastSeq, recentActions, renderBatches } from './eventlog'
import { stripHeading } from './project'
import { requireBook, state } from './state'
import { bibleStore, summaryStore } from './stores'

export interface SnapshotMode {
  /** Include the style page (the writer carries it in its own block instead). */
  style: boolean
  /** Include scene notes and the author's notes (the scan reads prose only). */
  notes: boolean
  /** Set when the book is too long: prose outside this chapter is left out. */
  proseOnlyIn?: string
  /**
   * What follows the snapshot is the event log (writer, planner) rather than
   * changed documents (scan). The snapshot then also holds the open alerts and
   * the conversation so far, which the log carries on from.
   */
  history?: boolean
  /** Include the conversation so far (the scan, which otherwise gets no history). */
  conversation?: boolean
}

interface Unit {
  key: string
  /** A short name, for when the changes are too long to send as text. */
  label: string
  text: string
}

interface Rendered {
  title: string
  style?: Unit
  pages: Unit[]
  planned: Unit
  bible: Unit[]
  /** The Notes section. */
  notes: Unit[]
  /** Notes before the first chapter. */
  notesFirst: Unit[]
  /** Each chapter's scenes and notes in order, and the notes that follow the chapter. */
  chapters: Array<{ id: string; number: number; title: string; intent: Unit; scenes: Unit[]; notesAfter: Unit[] }>
  /** Chapter and scene ids and titles in order, to notice structural changes. */
  contents: string
  /** Open alerts and the conversation so far, in history mode. */
  extras?: string
}

interface Frozen {
  text: string
  mode: SnapshotMode
  units: Map<string, Unit>
  contents: string
  takenAt: number
  lastUsed: number
  /** The last event already reflected in the snapshot. */
  logSeq: number
}

/** About 150k tokens. A full-length novel fits; past that the snapshot drops notes, then far-away prose. */
export const SNAPSHOT_BUDGET = 600_000
/** A 1-hour cache entry is cold soon after this much idle time; retaking then costs nothing extra. */
export const COLD_MS = 55 * 60_000

function esc(s: string): string {
  return s.replace(/"/g, '&quot;')
}

const DIRECTION: PageName[] = DIRECTION_PAGES.map((p) => p.name).filter((n) => n !== 'style.md')

/**
 * Render the book. `upTo` is the last logged event the rendering reflects:
 * read before rendering, so anything logged meanwhile lands in the history
 * after the snapshot (at worst twice, never lost).
 */
async function render(mode: SnapshotMode, upTo: number): Promise<Rendered> {
  const b = requireBook()
  // Writer and planner see which words are Claude's and unreviewed, and which
  // suggestions are waiting, so a retake keeps that, not only the text.
  const review = async (ref: DocRef, where = ''): Promise<string> => (mode.history ? reviewStateText((await b.readDoc(ref)).marks, where) : '')
  const tree = await b.tree()
  const scenes = await b.scenes()
  const summaries = await summaryStore.read()
  const allNotes = mode.notes ? await b.notes() : []
  const noteUnit = async (id: string): Promise<Unit | null> => {
    const n = allNotes.find((x) => x.id === id)
    if (!n) return null
    const marks = await review({ kind: 'note', id })
    return { key: `note:${id}`, label: `note ${id}`, text: `<note id="${esc(id)}" title="${esc(n.title)}">\n${stripHeading(n.text).trim() || '(empty)'}\n${marks ? `${marks}\n` : ''}</note>` }
  }
  const noteUnits = async (ids: string[]): Promise<Unit[]> => (await Promise.all(ids.map(noteUnit))).filter((u): u is Unit => u !== null)
  const pages: Unit[] = []
  for (const name of DIRECTION) {
    const text = (await b.readPage(name)).trim()
    const marks = await review({ kind: 'page', name })
    pages.push({ key: `page:${name}`, label: name, text: `<page name="${name}">\n${text || '(empty)'}\n${marks ? `${marks}\n` : ''}</page>` })
  }
  const planned = [(await b.readPage('bible.md')).trim(), await review({ kind: 'page', name: 'bible.md' })].filter(Boolean).join('\n')
  const style = mode.style ? [filledStyle(await b.readPage('style.md')), await review({ kind: 'page', name: 'style.md' })].filter(Boolean).join('\n') : ''
  const bible = (await bibleStore.read())
    .filter((e) => e.source.kind !== 'idea' || e.source.status !== 'dismissed')
    .map((e) => ({ key: `bible:${e.id}`, label: `bible entry ${e.id}`, text: bibleLine(e) }))
  const chapters: Rendered['chapters'] = []
  const contents: string[] = []
  const notes = await noteUnits(tree.notes.map((n) => n.id))
  for (const n of tree.notes) contents.push(`note ${n.id} · ${n.title}`)
  // Manuscript-level notes: before the first chapter, and after each chapter.
  const between = new Map<string | null, string[]>()
  let last: string | null = null
  for (const id of tree.order) {
    if (tree.chapters.some((c) => c.id === id)) last = id
    else between.set(last, [...(between.get(last) ?? []), id])
  }
  for (const id of between.get(null) ?? []) contents.push(`note ${id}`)
  const notesFirst = await noteUnits(between.get(null) ?? [])
  for (const c of tree.chapters) {
    const intent = [stripHeading((await b.readText(`${c.id}/chapter.md`)) ?? '').trim(), await review({ kind: 'chapter', chapterId: c.id })].filter(Boolean).join('\n')
    contents.push(`${c.id} · ${c.title}`)
    const units: Unit[] = []
    for (const id of c.order) {
      const s = scenes.find((x) => x.id === id)
      if (!s) {
        const u = await noteUnit(id)
        if (u) units.push(u)
        contents.push(`  note ${id}`)
        continue
      }
      contents.push(`  ${s.id} · ${s.title}`)
      const lines = [`<scene id="${esc(s.id)}" title="${esc(s.title)}">`]
      const sum = summaries[s.id]
      if (sum) lines.push(`<summary>${sum.text}</summary>`)
      if (mode.notes && s.notes?.trim()) lines.push(`<notes>\n${stripHeading(s.notes).trim()}\n</notes>`)
      if (mode.proseOnlyIn !== undefined && c.id !== mode.proseOnlyIn) lines.push('<prose>(left out to fit; see the summary)</prose>')
      else lines.push(`<prose>\n${s.prose ? stripHeading(s.prose).trim() || '(not drafted yet)' : '(not drafted yet)'}\n</prose>`)
      const marks = [mode.notes ? await review({ kind: 'scene', sceneId: s.id, file: 'notes' }, ' in the notes') : '', await review({ kind: 'scene', sceneId: s.id, file: 'prose' }, ' in the prose')]
        .filter(Boolean)
        .map((t) => t.replace(/^<review_state>\n|\n<\/review_state>$/g, ''))
      if (marks.length) lines.push(`<review_state>\n${marks.join('\n')}\n</review_state>`)
      lines.push('</scene>')
      units.push({ key: `scene:${s.id}`, label: `scene ${s.id}`, text: lines.join('\n') })
    }
    chapters.push({
      id: c.id,
      number: c.number,
      title: c.title,
      intent: { key: `intent:${c.id}`, label: `chapter intent ${c.id}`, text: `<chapter_intent chapter_id="${esc(c.id)}">\n${intent || '(empty)'}\n</chapter_intent>` },
      scenes: units,
      notesAfter: await noteUnits(between.get(c.id) ?? [])
    })
    for (const id of between.get(c.id) ?? []) contents.push(`note ${id}`)
  }
  const conversation = `<conversation_so_far>\n${await chatText()}\n</conversation_so_far>`
  const extras = mode.history ? `${await openAlertsText()}\n${conversation}\n${await recentActions(upTo)}` : mode.conversation ? conversation : undefined
  return {
    extras,
    title: tree.title,
    style: mode.style ? { key: 'page:style.md', label: 'style.md', text: `<style_page>\n${style || '(not filled in yet: the page still holds only the instructions a new book starts with)'}\n</style_page>` } : undefined,
    pages,
    planned: { key: 'page:bible.md', label: 'bible.md', text: `<page name="bible.md">\n${planned || '(none)'}\n</page>` },
    bible,
    notes,
    notesFirst,
    chapters,
    contents: contents.join('\n')
  }
}

function unitsOf(r: Rendered): Map<string, Unit> {
  const all = [...(r.style ? [r.style] : []), ...r.pages, r.planned, ...r.bible, ...r.notes, ...r.notesFirst, ...r.chapters.flatMap((c) => [c.intent, ...c.scenes, ...c.notesAfter])]
  return new Map(all.map((u) => [u.key, u]))
}

function assemble(r: Rendered): string {
  const out = ['<book_snapshot>']
  if (r.style) out.push(r.style.text)
  out.push('<direction>', ...r.pages.map((p) => p.text), '</direction>')
  out.push('<bible>', r.planned.text, '<entries>', r.bible.map((e) => e.text).join('\n') || '(none yet)', '</entries>', '</bible>')
  if (r.notes.length) out.push('<notes_section>', ...r.notes.map((n) => n.text), '</notes_section>')
  out.push(`<manuscript title="${esc(r.title)}">`)
  out.push(...r.notesFirst.map((n) => n.text))
  for (const c of r.chapters) {
    out.push(`<chapter id="${esc(c.id)}" number="${c.number}" title="${esc(c.title)}">`, c.intent.text, ...c.scenes.map((s) => s.text), '</chapter>', ...c.notesAfter.map((n) => n.text))
  }
  out.push('</manuscript>')
  if (r.extras) out.push(r.extras)
  out.push('</book_snapshot>')
  return out.join('\n')
}

function focusChapter(r: Rendered): string {
  const p = state.place
  if (p.chapterId) return p.chapterId
  if (p.sceneId) return p.sceneId.split('/').slice(0, 2).join('/')
  return r.chapters.at(-1)?.id ?? ''
}

/** Render the book in the given mode, fitted to the budget. */
async function fitted(mode: SnapshotMode, upTo = lastSeq()): Promise<{ mode: SnapshotMode; rendered: Rendered; text: string }> {
  let rendered = await render(mode, upTo)
  let text = assemble(rendered)
  if (text.length > SNAPSHOT_BUDGET && mode.notes) {
    mode = { ...mode, notes: false }
    rendered = await render(mode, upTo)
    text = assemble(rendered)
  }
  if (text.length > SNAPSHOT_BUDGET) {
    mode = { ...mode, proseOnlyIn: focusChapter(rendered) }
    rendered = await render(mode, upTo)
    text = assemble(rendered)
  }
  return { mode, rendered, text }
}

/**
 * What differs between two renderings of the book, as current text. Bible
 * entries are listed as lines; everything else as its whole current unit.
 */
export function diffUnits(before: Map<string, Unit>, after: Map<string, Unit>, beforeContents: string, afterContents: string): { text: string; labels: string[] } {
  const docs: string[] = []
  const bible: string[] = []
  const labels: string[] = []
  for (const [key, u] of after) {
    if (before.get(key)?.text === u.text) continue
    labels.push(u.label)
    if (key.startsWith('bible:')) bible.push(u.text)
    else docs.push(u.text)
  }
  for (const [key, u] of before) {
    if (after.has(key)) continue
    labels.push(`${u.label} (removed)`)
    if (key.startsWith('bible:')) bible.push(`- removed: ${u.label}`)
    else docs.push(`<removed>${u.label}</removed>`)
  }
  const parts = [...docs]
  if (bible.length) parts.push(`<bible_changes>\n${bible.join('\n')}\n</bible_changes>`)
  if (beforeContents !== afterContents) parts.push(`<contents_now>\nChapters and scenes as they are now, in order:\n${afterContents}\n</contents_now>`)
  return { text: parts.join('\n'), labels }
}

const frozen = new Map<string, Frozen>()

export function resetSnapshots(): void {
  frozen.clear()
}

/** Retake once the changes would cost more to carry than a fresh snapshot costs to write. */
export function changesTooLarge(changesChars: number, snapshotChars: number): boolean {
  return changesChars > Math.min(120_000, Math.max(8_000, snapshotChars * 0.2))
}

export interface BookContext {
  /** The frozen snapshot: byte-identical from call to call until it is retaken. */
  snapshot: string
  /** Scan: what changed since the snapshot, as current text. */
  changes: string
  /** Writer and planner: the event log since the snapshot, one text per batch. */
  history: string[]
  /** The last event the snapshot reflects. */
  logSeq: number
}

const CHANGES_HEAD =
  'These documents changed after the snapshot above was taken. The text here is current and replaces what the snapshot shows for the same document; anything not listed is unchanged.'
const NO_CHANGES = '<changed_since_snapshot>(nothing has changed since the snapshot)</changed_since_snapshot>'

/** The frozen snapshot for one role, retaken when needed, plus what happened since. */
export async function bookContextFor(role: string, mode: SnapshotMode, now = Date.now()): Promise<BookContext> {
  // Bring the log up to date first, so a snapshot taken now and the log after it meet exactly.
  if (mode.history) await closeBatch()
  let f = frozen.get(role)
  if (f && now - f.lastUsed <= COLD_MS) {
    if (mode.history) {
      const history = renderBatches(eventsSince(f.logSeq))
      if (!changesTooLarge(history.reduce((n, t) => n + t.length, 0), f.text.length)) {
        f.lastUsed = now
        return { snapshot: f.text, changes: '', history, logSeq: f.logSeq }
      }
    } else {
      const rendered = await render(f.mode, lastSeq())
      const diff = diffUnits(f.units, unitsOf(rendered), f.contents, rendered.contents)
      // The scan reads documents, not the log, but still hears the conversation.
      const chat = f.mode.conversation ? eventsSince(f.logSeq).filter((e) => e.kind === 'chat' || e.kind === 'reply') : []
      const text = [diff.text, chat.length ? `<chat_since_snapshot>\n${chat.map((e) => e.text).join('\n')}\n</chat_since_snapshot>` : ''].filter(Boolean).join('\n')
      if (!changesTooLarge(text.length, f.text.length)) {
        f.lastUsed = now
        return { snapshot: f.text, changes: text ? `<changed_since_snapshot>\n${CHANGES_HEAD}\n${text}\n</changed_since_snapshot>` : NO_CHANGES, history: [], logSeq: f.logSeq }
      }
    }
  }
  const upTo = lastSeq()
  const fit = await fitted(mode, upTo)
  f = { text: fit.text, mode: fit.mode, units: unitsOf(fit.rendered), contents: fit.rendered.contents, takenAt: now, lastUsed: now, logSeq: upTo }
  frozen.set(role, f)
  return { snapshot: f.text, changes: mode.history ? '' : NO_CHANGES, history: [], logSeq: f.logSeq }
}

/** The book as it is now, for one-off calls that keep no snapshot. */
export async function currentBookText(mode: SnapshotMode = { style: true, notes: true }): Promise<string> {
  return (await fitted(mode)).text
}

/** What the writer sees besides its style page: the frozen book, then the event log since. */
export async function writerBookContext(): Promise<{ snapshot: string; history: string[] }> {
  const ctx = await bookContextFor('writer', { style: false, notes: true, history: true })
  return { snapshot: ctx.snapshot, history: ctx.history }
}
