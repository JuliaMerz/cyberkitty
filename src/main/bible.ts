// The story bible: what is true in the story. Most of it is taken from the
// text automatically as work settles, with no approval and no marker, because
// the text already says it. Planned entries are the author's (bible.md).
// Claude's own ideas wear the unreviewed mark until kept or dismissed.

import type { BibleEntry, BibleType } from '@shared/types'
import { newId } from './state'
import { alertStore, bibleStore } from './stores'
import { pairKey } from './alerts'

export async function addIdea(type: BibleType, subject: string, text: string, why: string, chatId?: string): Promise<BibleEntry> {
  const entry: BibleEntry = {
    id: newId('b'),
    type,
    subject,
    text,
    source: { kind: 'idea', status: 'pending', chatId },
    updatedAt: new Date().toISOString()
  }
  await bibleStore.update((all) => [...all, entry])
  await alertStore.update((all) => [
    ...all,
    {
      id: newId('al'),
      kind: 'idea',
      title: `${subject}: ${text}`,
      explanation: why,
      sides: [],
      status: 'open',
      pairKey: pairKey('idea', [{ ref: { kind: 'page', name: 'bible.md' }, quote: `${subject} ${text}` }]),
      bibleId: entry.id,
      at: entry.updatedAt
    }
  ])
  return entry
}

export interface ExtractedEntry {
  type: BibleType
  subject: string
  text: string
  story_time?: string
  order?: number
  quote: string
  from?: string
  to?: string
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Replace what the bible says a scene established with what it says now.
 * Entries the author corrected stay as corrected; changed entries keep their
 * history so the change can be seen.
 */
export function mergeSceneEntries(all: BibleEntry[], sceneId: string, extracted: ExtractedEntry[], now = new Date().toISOString()): BibleEntry[] {
  const mine = all.filter((e) => e.source.kind === 'text' && e.source.sceneId === sceneId)
  const others = all.filter((e) => !(e.source.kind === 'text' && e.source.sceneId === sceneId))
  const used = new Set<string>()
  const next: BibleEntry[] = []
  for (const x of extracted) {
    const match =
      mine.find((e) => !used.has(e.id) && e.source.kind === 'text' && norm(e.source.quote) === norm(x.quote)) ??
      mine.find((e) => !used.has(e.id) && e.type === x.type && norm(e.subject) === norm(x.subject) && norm(e.text) === norm(x.text)) ??
      mine.find((e) => !used.has(e.id) && e.type === x.type && norm(e.subject) === norm(x.subject))
    if (match) {
      used.add(match.id)
      if (match.corrected) {
        next.push({ ...match, source: { kind: 'text', sceneId, quote: x.quote } })
        continue
      }
      const changed = norm(match.text) !== norm(x.text)
      next.push({
        ...match,
        text: x.text,
        storyTime: x.story_time || match.storyTime,
        order: x.order ?? match.order,
        from: x.from || match.from,
        to: x.to || match.to,
        source: { kind: 'text', sceneId, quote: x.quote },
        history: changed ? [...(match.history ?? []), { text: match.text, at: match.updatedAt }] : match.history,
        updatedAt: changed ? now : match.updatedAt
      })
    } else {
      next.push({
        id: newId('b'),
        type: x.type,
        subject: x.subject,
        text: x.text,
        storyTime: x.story_time || undefined,
        order: x.order,
        from: x.from || undefined,
        to: x.to || undefined,
        source: { kind: 'text', sceneId, quote: x.quote },
        updatedAt: now
      })
    }
  }
  // Corrected entries whose scene no longer says anything about them stay, so a correction sticks.
  for (const e of mine) if (!used.has(e.id) && e.corrected) next.push(e)
  return [...others, ...next]
}

export async function saveEntry(entry: BibleEntry): Promise<void> {
  await bibleStore.update((all) => {
    const i = all.findIndex((e) => e.id === entry.id)
    const prev = i >= 0 ? all[i] : null
    const fixed: BibleEntry = { ...entry, updatedAt: new Date().toISOString() }
    if (prev && prev.text !== entry.text) {
      fixed.history = [...(prev.history ?? []), { text: prev.text, at: prev.updatedAt }]
      if (prev.source.kind === 'text') fixed.corrected = true
    }
    return i >= 0 ? all.map((e, j) => (j === i ? fixed : e)) : [...all, fixed]
  })
  // Keeping or dismissing an idea settles its alert.
  if (entry.source.kind === 'idea' && entry.source.status !== 'pending') {
    await alertStore.update((all) => all.map((a) => (a.bibleId === entry.id && a.status === 'open' ? { ...a, status: entry.source.kind === 'idea' && entry.source.status === 'kept' ? 'done' : 'dismissed' } : a)))
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await bibleStore.update((all) => all.filter((e) => e.id !== id))
}
