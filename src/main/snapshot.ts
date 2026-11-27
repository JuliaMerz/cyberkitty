// Frozen book snapshots, for prompt caching.
//
// Caching is a prefix match: a single changed byte invalidates everything
// after it. The book changes all the time, so each Claude role keeps a frozen
// copy of the whole book in its cached prefix (1-hour TTL) and receives what
// changed since then, as the current text of each changed document, after it.
// The snapshot is retaken when those changes pile up, or when its cache has
// gone cold anyway (no call for most of an hour), so a fresh copy costs
// nothing extra.
//
// The book is split into units (a page, a chapter intent, a scene, a bible
// entry). A unit's rendered text is what the snapshot shows and what the diff
// compares, so "changed" means exactly "renders differently".

import { DIRECTION_PAGES, type PageName } from '@shared/types'
import { bibleLine, chatText, openAlertsText } from './context'
import { stripHeading } from './project'
import { requireBook, state } from './state'
import { bibleStore, summaryStore } from './stores'

export interface SnapshotMode {
  /** Include the style page (the writer carries it in its own block instead). */
  style: boolean
  /** Include scene notes (the scan reads prose only). */
  notes: boolean
  /** Set when the book is too long: prose outside this chapter is left out. */
  proseOnlyIn?: string
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
  chapters: Array<{ id: string; number: number; title: string; intent: Unit; scenes: Unit[] }>
  /** Chapter and scene ids and titles in order, to notice structural changes. */
  contents: string
}

interface Frozen {
  text: string
  mode: SnapshotMode
  units: Map<string, Unit>
  contents: string
  takenAt: number
  lastUsed: number
}

/** About 150k tokens. A full-length novel fits; past that the snapshot drops notes, then far-away prose. */
export const SNAPSHOT_BUDGET = 600_000
/** A 1-hour cache entry is cold soon after this much idle time; retaking then costs nothing extra. */
export const COLD_MS = 55 * 60_000

function esc(s: string): string {
  return s.replace(/"/g, '&quot;')
}

const DIRECTION: PageName[] = DIRECTION_PAGES.map((p) => p.name).filter((n) => n !== 'style.md')

async function render(mode: SnapshotMode): Promise<Rendered> {
  const b = requireBook()
  const tree = await b.tree()
  const scenes = await b.scenes()
  const summaries = await summaryStore.read()
  const pages: Unit[] = []
  for (const name of DIRECTION) {
    const text = (await b.readPage(name)).trim()
    pages.push({ key: `page:${name}`, label: name, text: `<page name="${name}">\n${text || '(empty)'}\n</page>` })
  }
  const planned = (await b.readPage('bible.md')).trim()
  const style = mode.style ? (await b.readPage('style.md')).trim() : ''
  const bible = (await bibleStore.read())
    .filter((e) => e.source.kind !== 'idea' || e.source.status !== 'dismissed')
    .map((e) => ({ key: `bible:${e.id}`, label: `bible entry ${e.id}`, text: bibleLine(e) }))
  const chapters: Rendered['chapters'] = []
  const contents: string[] = []
  for (const c of tree.chapters) {
    const intent = stripHeading((await b.readText(`${c.id}/chapter.md`)) ?? '').trim()
    contents.push(`${c.id} · ${c.title}`)
    const units: Unit[] = []
    for (const s of scenes.filter((x) => x.chapterId === c.id)) {
      contents.push(`  ${s.id} · ${s.title}`)
      const lines = [`<scene id="${esc(s.id)}" title="${esc(s.title)}">`]
      const sum = summaries[s.id]
      if (sum) lines.push(`<summary>${sum.text}</summary>`)
      if (mode.notes && s.notes?.trim()) lines.push(`<notes>\n${stripHeading(s.notes).trim()}\n</notes>`)
      if (mode.proseOnlyIn !== undefined && c.id !== mode.proseOnlyIn) lines.push('<prose>(left out to fit; see the summary)</prose>')
      else lines.push(`<prose>\n${s.prose ? stripHeading(s.prose).trim() || '(not drafted yet)' : '(not drafted yet)'}\n</prose>`)
      lines.push('</scene>')
      units.push({ key: `scene:${s.id}`, label: `scene ${s.id}`, text: lines.join('\n') })
    }
    chapters.push({
      id: c.id,
      number: c.number,
      title: c.title,
      intent: { key: `intent:${c.id}`, label: `chapter intent ${c.id}`, text: `<chapter_intent chapter_id="${esc(c.id)}">\n${intent || '(empty)'}\n</chapter_intent>` },
      scenes: units
    })
  }
  return {
    title: tree.title,
    style: mode.style ? { key: 'page:style.md', label: 'style.md', text: `<style_page>\n${style || '(empty)'}\n</style_page>` } : undefined,
    pages,
    planned: { key: 'page:bible.md', label: 'bible.md', text: `<page name="bible.md">\n${planned || '(none)'}\n</page>` },
    bible,
    chapters,
    contents: contents.join('\n')
  }
}

function unitsOf(r: Rendered): Map<string, Unit> {
  const all = [...(r.style ? [r.style] : []), ...r.pages, r.planned, ...r.bible, ...r.chapters.flatMap((c) => [c.intent, ...c.scenes])]
  return new Map(all.map((u) => [u.key, u]))
}

function assemble(r: Rendered): string {
  const out = ['<book_snapshot>']
  if (r.style) out.push(r.style.text)
  out.push('<direction>', ...r.pages.map((p) => p.text), '</direction>')
  out.push('<bible>', r.planned.text, '<entries>', r.bible.map((e) => e.text).join('\n') || '(none yet)', '</entries>', '</bible>')
  out.push(`<manuscript title="${esc(r.title)}">`)
  for (const c of r.chapters) {
    out.push(`<chapter id="${esc(c.id)}" number="${c.number}" title="${esc(c.title)}">`, c.intent.text, ...c.scenes.map((s) => s.text), '</chapter>')
  }
  out.push('</manuscript>', '</book_snapshot>')
  return out.join('\n')
}

function focusChapter(r: Rendered): string {
  const p = state.place
  if (p.chapterId) return p.chapterId
  if (p.sceneId) return p.sceneId.split('/').slice(0, 2).join('/')
  return r.chapters.at(-1)?.id ?? ''
}

/** Render the book in the given mode, fitted to the budget. */
async function fitted(mode: SnapshotMode): Promise<{ mode: SnapshotMode; rendered: Rendered; text: string }> {
  let rendered = await render(mode)
  let text = assemble(rendered)
  if (text.length > SNAPSHOT_BUDGET && mode.notes) {
    mode = { ...mode, notes: false }
    rendered = await render(mode)
    text = assemble(rendered)
  }
  if (text.length > SNAPSHOT_BUDGET) {
    mode = { ...mode, proseOnlyIn: focusChapter(rendered) }
    rendered = await render(mode)
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
  /** What changed since the snapshot, as current text. Never cache it for long. */
  changes: string
  /** The book as the snapshot's mode renders it now, for later diffs. */
  units: Map<string, Unit>
  contents: string
}

const CHANGES_HEAD =
  'These documents changed after the snapshot above was taken. The text here is current and replaces what the snapshot shows for the same document; anything not listed is unchanged.'

/** The frozen snapshot for one role, retaken when needed, plus what changed since. */
export async function bookContextFor(role: string, mode: SnapshotMode, now = Date.now()): Promise<BookContext> {
  let f = frozen.get(role)
  let rendered: Rendered | null = null
  if (f && now - f.lastUsed <= COLD_MS) {
    rendered = await render(f.mode)
    const units = unitsOf(rendered)
    const diff = diffUnits(f.units, units, f.contents, rendered.contents)
    if (!changesTooLarge(diff.text.length, f.text.length)) {
      f.lastUsed = now
      return {
        snapshot: f.text,
        changes: diff.text ? `<changed_since_snapshot>\n${CHANGES_HEAD}\n${diff.text}\n</changed_since_snapshot>` : '<changed_since_snapshot>(nothing has changed since the snapshot)</changed_since_snapshot>',
        units,
        contents: rendered.contents
      }
    }
  }
  const fit = await fitted(mode)
  f = { text: fit.text, mode: fit.mode, units: unitsOf(fit.rendered), contents: fit.rendered.contents, takenAt: now, lastUsed: now }
  frozen.set(role, f)
  return { snapshot: f.text, changes: '<changed_since_snapshot>(nothing has changed since the snapshot)</changed_since_snapshot>', units: f.units, contents: f.contents }
}

/** The book as it is now, for one-off calls that keep no snapshot. */
export async function currentBookText(mode: SnapshotMode = { style: true, notes: true }): Promise<string> {
  return (await fitted(mode)).text
}

/** The units of the book now, in the mode of a role's snapshot (for the planner's per-message diffs). */
export async function unitsNow(role: string): Promise<{ units: Map<string, Unit>; contents: string } | null> {
  const f = frozen.get(role)
  if (!f) return null
  const r = await render(f.mode)
  return { units: unitsOf(r), contents: r.contents }
}

/** What the writer sees besides its style page: the frozen book, then what changed, open alerts and the chat. */
export async function writerBookContext(): Promise<{ snapshot: string; tail: string }> {
  const ctx = await bookContextFor('writer', { style: false, notes: true })
  return { snapshot: ctx.snapshot, tail: [ctx.changes, await openAlertsText(), await chatText()].join('\n\n') }
}
