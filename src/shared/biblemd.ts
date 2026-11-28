// The story bible as Markdown: one file per kind of fact under bible/, so the
// bible can be read, edited and exported like the rest of the book.
//
//   bible/characters.md
//   # Characters
//
//   ## Mara
//
//   - Has a scar on her left hand. _(day 1 · from “Arrival”)_
//
// Each fact is a bullet under the heading of who or what it is about. A
// trailing _( … )_ holds its story time, a movement's from → to, and the scene
// it comes from. The files hold only words: the ids, the quote each fact rests
// on, its history and Claude's ideas still waiting live in
// .cyberkitty/bible.json, which heals against whatever the files say now:
//
// - a line as it was last written: the same fact;
// - a changed line under the same heading: the author corrected that fact
//   (a correction sticks: settling will not overwrite it);
// - the same words under another heading: the fact moved;
// - a line nobody wrote before: a new fact of the author's;
// - a fact whose line is gone: the author removed it.
//
// Nothing the author writes is lost: any line under a heading, bullet or not,
// is read as a fact.

import { BIBLE_TYPES, type BibleEntry, type BibleType } from './types'

export const BIBLE_DIR = 'bible'

export const BIBLE_FILES: Record<BibleType, string> = {
  character: 'characters.md',
  event: 'events.md',
  movement: 'movements.md',
  place: 'places.md',
  world: 'world.md'
}

/** What the sidecar remembers about each fact's line, to recognise it next time. */
export type Written = Record<string, { subject: string; line: string }>

/** Facts that belong in the book: from the text, the author's own, and Claude's ideas once kept. */
export function inBook(e: BibleEntry): boolean {
  return e.source.kind !== 'idea' || e.source.status === 'kept'
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function factLine(e: BibleEntry, sceneTitle: (id: string) => string): string {
  const meta: string[] = []
  if (e.type === 'movement' && (e.from || e.to)) meta.push(`${e.from || '?'} → ${e.to || '?'}`)
  if (e.storyTime) meta.push(oneLine(e.storyTime))
  if (e.source.kind === 'text') meta.push(`from “${sceneTitle(e.source.sceneId)}”`)
  return `- ${oneLine(e.text)}${meta.length ? ` _(${meta.join(' · ')})_` : ''}`
}

function sorted(type: BibleType, entries: BibleEntry[]): BibleEntry[] {
  if (type !== 'event') return entries
  // Events read best in story order; ties keep the order they were found in.
  return entries.map((e, i) => ({ e, i })).sort((a, b) => (a.e.order ?? Infinity) - (b.e.order ?? Infinity) || a.i - b.i).map((x) => x.e)
}

/** One file's Markdown, and the line each fact was written as. */
export function renderBibleFile(type: BibleType, entries: BibleEntry[], sceneTitle: (id: string) => string): { text: string; lines: Written } {
  const title = BIBLE_TYPES.find((t) => t.type === type)?.title ?? type
  const mine = sorted(type, entries.filter((e) => e.type === type && inBook(e)))
  const groups = new Map<string, BibleEntry[]>()
  for (const e of mine) {
    const subject = oneLine(e.subject)
    groups.set(subject, [...(groups.get(subject) ?? []), e])
  }
  const out = [`# ${title}`, '']
  const lines: Written = {}
  // Facts about nothing in particular come first, under the title.
  const loose = groups.get('') ?? []
  for (const e of loose) {
    const line = factLine(e, sceneTitle)
    lines[e.id] = { subject: '', line }
    out.push(line)
  }
  if (loose.length) out.push('')
  for (const [subject, list] of groups) {
    if (!subject) continue
    out.push(`## ${subject}`, '')
    for (const e of list) {
      const line = factLine(e, sceneTitle)
      lines[e.id] = { subject, line }
      out.push(line)
    }
    out.push('')
  }
  return { text: out.join('\n').replace(/\n+$/, '\n'), lines }
}

export interface ParsedFact {
  subject: string
  text: string
  /** The trailer, when the line has one. */
  storyTime?: string
  from?: string
  to?: string
  hasMeta: boolean
  line: string
}

export function parseBibleFile(md: string): ParsedFact[] {
  const out: ParsedFact[] = []
  let subject = ''
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^#\s/.test(line)) continue
    const h = /^#{2,6}\s+(.*)$/.exec(line)
    if (h) {
      subject = oneLine(h[1])
      continue
    }
    const content = (/^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)?.[1] ?? line).trim()
    if (!content) continue
    const m = /^(.*?)\s*_\((.*)\)_$/.exec(content)
    const fact: ParsedFact = { subject, text: oneLine(m ? m[1] : content), hasMeta: Boolean(m), line }
    if (m) {
      for (const part of m[2].split(' · ').map((p) => p.trim())) {
        if (!part || /^from\s/.test(part)) continue
        const move = /^(.*?)\s*→\s*(.*)$/.exec(part)
        if (move) {
          fact.from = move[1] === '?' ? undefined : move[1] || undefined
          fact.to = move[2] === '?' ? undefined : move[2] || undefined
        } else fact.storyTime = part
      }
    }
    if (fact.text) out.push(fact)
  }
  return out
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? [])
}

function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / Math.max(x.size, y.size)
}

/**
 * Bring the entries in line with what the files say now. `files` maps a type
 * to its file's text, or null when the file does not exist (then nothing is
 * learned from it, and it is written again).
 */
export function healBible(
  entries: BibleEntry[],
  written: Written,
  files: Map<BibleType, string | null>,
  newId: () => string,
  now = new Date().toISOString()
): { entries: BibleEntry[]; written: Written; changed: boolean } {
  const next = new Map(entries.map((e) => [e.id, e]))
  const seen: Written = { ...written }
  const added: BibleEntry[] = []
  let changed = false

  for (const { type } of BIBLE_TYPES) {
    const md = files.get(type)
    if (md === null || md === undefined) continue
    const facts = parseBibleFile(md)
    // Facts that were in this file the last time it was written or read.
    const expected = entries.filter((e) => e.type === type && written[e.id] && inBook(e))
    const open = new Set(expected.map((e) => e.id))
    const left: ParsedFact[] = []

    // 1. Unchanged lines.
    for (const f of facts) {
      const hit = expected.find((e) => open.has(e.id) && written[e.id].line === f.line && written[e.id].subject === f.subject)
      if (hit) open.delete(hit.id)
      else left.push(f)
    }

    const apply = (e: BibleEntry, f: ParsedFact): void => {
      const textChanged = oneLine(e.text) !== f.text
      const timeChanged = f.hasMeta && (f.storyTime ?? '') !== (e.storyTime ?? '')
      const moveChanged = f.hasMeta && e.type === 'movement' && ((f.from ?? '') !== (e.from ?? '') || (f.to ?? '') !== (e.to ?? ''))
      const subjectChanged = oneLine(e.subject) !== f.subject
      const updated: BibleEntry = { ...e, subject: f.subject, text: f.text }
      if (f.hasMeta) {
        updated.storyTime = f.storyTime
        if (e.type === 'movement') {
          updated.from = f.from
          updated.to = f.to
        }
      }
      if (textChanged || timeChanged || moveChanged || subjectChanged) {
        changed = true
        updated.updatedAt = now
        if (textChanged) updated.history = [...(e.history ?? []), { text: e.text, at: e.updatedAt }]
        if (e.source.kind === 'text') updated.corrected = true
      }
      next.set(e.id, updated)
      seen[e.id] = { subject: f.subject, line: f.line }
      open.delete(e.id)
    }

    // 2. Edited in place: the closest remaining fact under the same heading.
    const rest: ParsedFact[] = []
    for (const f of left) {
      let best: BibleEntry | null = null
      let score = 0
      for (const e of expected) {
        if (!open.has(e.id) || oneLine(e.subject) !== f.subject) continue
        const s = similarity(e.text, f.text)
        if (s > score) {
          best = e
          score = s
        }
      }
      if (best && score >= 0.3) apply(best, f)
      else rest.push(f)
    }
    // 3. Moved under another heading, same words.
    const fresh: ParsedFact[] = []
    for (const f of rest) {
      const moved = expected.find((e) => open.has(e.id) && oneLine(e.text) === f.text)
      if (moved) apply(moved, f)
      else fresh.push(f)
    }
    // 4. New facts of the author's.
    for (const f of fresh) {
      const e: BibleEntry = {
        id: newId(),
        type,
        subject: f.subject,
        text: f.text,
        ...(f.storyTime ? { storyTime: f.storyTime } : {}),
        ...(f.from ? { from: f.from } : {}),
        ...(f.to ? { to: f.to } : {}),
        source: { kind: 'planned' },
        updatedAt: now
      }
      added.push(e)
      seen[e.id] = { subject: f.subject, line: f.line }
      changed = true
    }
    // 5. Lines that are gone: the author removed those facts.
    for (const id of open) {
      next.delete(id)
      delete seen[id]
      changed = true
    }
  }
  return { entries: [...[...next.values()], ...added], written: seen, changed }
}
