// Pieces of the book as Claude reads them: direction pages, the bible, the
// manuscript, open alerts and the chat. Every scene is labelled with its id so
// Claude can link to it. Whole-book snapshots for cached prompts live in
// snapshot.ts.

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

/** Chat entries being handled right now: they reach Claude as the event in hand, not as history. */
export const pendingChat = new Set<string>()

/** The conversation between the author and the planner, newest last, within a budget. */
export async function chatText(budget = 120_000): Promise<string> {
  const entries = (await chatStore.read()).filter((e) => !e.streaming && !pendingChat.has(e.id))
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
