// The book as Claude reads it: direction pages, style page, outline, bible,
// summaries and the manuscript, in the order the planner's cache wants
// (stable first). Every scene is labelled with its id so Claude can link to it.

import { DIRECTION_PAGES, type BibleEntry } from '@shared/types'
import { requireBook } from './state'
import { alertStore, bibleStore, chatStore, summaryStore } from './stores'
import { stripHeading } from './project'

function esc(s: string): string {
  return s.replace(/"/g, '&quot;')
}

export function bibleLine(e: BibleEntry): string {
  const when = e.storyTime ? ` [${e.storyTime}]` : ''
  const move = e.type === 'movement' && (e.from || e.to) ? ` (${e.from ?? '?'} → ${e.to ?? '?'})` : ''
  const src =
    e.source.kind === 'text'
      ? ` (from ${e.source.sceneId}: “${e.source.quote}”)`
      : e.source.kind === 'planned'
        ? ' (planned)'
        : ` (Claude's idea, ${e.source.status})`
  return `- id=${e.id} ${e.type} · ${e.subject}${when}${move}: ${e.text}${src}`
}

export async function directionText(): Promise<string> {
  const b = requireBook()
  const parts: string[] = []
  for (const p of DIRECTION_PAGES) {
    if (p.name === 'style.md') continue
    const text = (await b.readPage(p.name)).trim()
    parts.push(`<page name="${p.name}">\n${text || '(empty)'}\n</page>`)
  }
  return `<direction>\n${parts.join('\n')}\n</direction>`
}

export async function bibleText(): Promise<string> {
  const b = requireBook()
  const entries = (await bibleStore.read()).filter((e) => e.source.kind !== 'idea' || e.source.status !== 'dismissed')
  const planned = (await b.readPage('bible.md')).trim()
  return `<bible>\n<planned_by_author>\n${planned || '(none)'}\n</planned_by_author>\n<entries>\n${entries.map(bibleLine).join('\n') || '(none yet)'}\n</entries>\n</bible>`
}

/**
 * Roughly 150k tokens of manuscript. A full-length novel fits; past that, the
 * snapshot keeps every summary but drops notes, then prose outside the
 * chapter in focus, so a very long book still fits in context.
 */
const MANUSCRIPT_BUDGET = 600_000

export async function fittedManuscript(focusChapter?: string): Promise<string> {
  const full = await manuscriptText({ notes: true })
  if (full.length <= MANUSCRIPT_BUDGET) return full
  const lean = await manuscriptText({ notes: false })
  if (lean.length <= MANUSCRIPT_BUDGET) return lean
  return manuscriptText({ notes: false, proseOnlyIn: focusChapter ?? '' })
}

export async function manuscriptText(opts: { notes: boolean; proseOnlyIn?: string } = { notes: true }): Promise<string> {
  const b = requireBook()
  const tree = await b.tree()
  const scenes = await b.scenes()
  const summaries = await summaryStore.read()
  const out: string[] = []
  for (const c of tree.chapters) {
    const intent = stripHeading((await b.readText(`${c.id}/chapter.md`)) ?? '').trim()
    out.push(`<chapter id="${esc(c.id)}" number="${c.number}" title="${esc(c.title)}">`)
    if (intent) out.push(`<chapter_intent>\n${intent}\n</chapter_intent>`)
    for (const s of scenes.filter((x) => x.chapterId === c.id)) {
      out.push(`<scene id="${esc(s.id)}" title="${esc(s.title)}">`)
      const sum = summaries[s.id]
      if (sum) out.push(`<summary>${sum.text}</summary>`)
      if (opts.notes && s.notes?.trim()) out.push(`<notes>\n${stripHeading(s.notes).trim()}\n</notes>`)
      if (opts.proseOnlyIn !== undefined && c.id !== opts.proseOnlyIn) out.push(`<prose>(left out to fit; see the summary)</prose>`)
      else out.push(`<prose>\n${s.prose ? stripHeading(s.prose).trim() || '(not drafted yet)' : '(not drafted yet)'}\n</prose>`)
      out.push('</scene>')
    }
    out.push('</chapter>')
  }
  return `<manuscript title="${esc(tree.title)}">\n${out.join('\n')}\n</manuscript>`
}

export async function openAlertsText(): Promise<string> {
  const alerts = (await alertStore.read()).filter((a) => a.status === 'open')
  if (!alerts.length) return '<open_alerts>(none)</open_alerts>'
  return `<open_alerts>\n${alerts.map((a) => `- id=${a.id} ${a.kind}: ${a.title}. ${a.explanation}`).join('\n')}\n</open_alerts>`
}

export async function bookSnapshot(opts: { style?: boolean; focusChapter?: string } = {}): Promise<string> {
  const b = requireBook()
  const style = (await b.readPage('style.md')).trim()
  return [
    `<book_snapshot taken="${new Date().toISOString()}">`,
    opts.style === false ? '' : `<style_page>\n${style || '(empty)'}\n</style_page>`,
    await directionText(),
    await bibleText(),
    await fittedManuscript(opts.focusChapter),
    await openAlertsText(),
    '</book_snapshot>'
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** The conversation between the author and the planner, newest last, within a budget. */
export async function chatText(budget = 120_000): Promise<string> {
  const entries = await chatStore.read()
  const lines: string[] = []
  let used = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (!e.text.trim()) continue
    const who = e.role === 'author' ? `Author${e.place ? ` (on ${e.place.label})` : ''}` : e.role === 'claude' ? 'Planner' : 'Planner action'
    const quotes = e.passages?.length ? ` [attached: ${e.passages.map((p) => `“${p.quote}”`).join(' ')}]` : ''
    const line = `${who}: ${e.text.trim()}${quotes}`
    if (used + line.length > budget) break
    used += line.length
    lines.unshift(line)
  }
  return lines.length ? `<chat>\n${lines.join('\n')}\n</chat>` : '<chat>(no conversation yet)</chat>'
}

/** What the writer sees besides its style page: the whole book and the chat. */
export async function writerBookContext(focusChapter?: string): Promise<string> {
  return `${await bookSnapshot({ style: false, focusChapter })}\n\n${await chatText()}`
}
