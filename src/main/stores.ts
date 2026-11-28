// App data kept beside the book under .cyberkitty/. Derived data (bible
// entries from the text, summaries) can be rebuilt from the Markdown;
// sidecar-like data (chat, alerts, dismissals) heals or falls back safely.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BIBLE_DIR, BIBLE_FILES, healBible, renderBibleFile, type Written } from '@shared/biblemd'
import { BIBLE_TYPES, type Alert, type BibleEntry, type BibleType, type ChangeSpec, type ChatEntry, type Correction, type Diagram, type SceneSummary } from '@shared/types'
import { atomicWrite, META } from './project'
import { newId, requireBook, send } from './state'

type DataKind = 'bible' | 'summaries' | 'alerts' | 'changes' | 'diagrams' | 'history'

function changed(what: DataKind): void {
  send('data-changed', what)
}

// Writes to one store are queued so read-modify-write never interleaves.
const queues = new Map<string, Promise<unknown>>()
function serial<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(name) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(name, next.catch(() => undefined))
  return next
}

function store<T>(file: string, fallback: () => T, kind?: DataKind) {
  const listeners = new Set<(before: T, after: T) => void>()
  return {
    read: (): Promise<T> => requireBook().readJson<T>(file, fallback()),
    update: (fn: (cur: T) => T | Promise<T>): Promise<T> =>
      serial(file, async () => {
        const b = requireBook()
        const cur = await b.readJson<T>(file, fallback())
        const before = listeners.size ? structuredClone(cur) : cur
        const next = await fn(cur)
        await b.writeJson(file, next)
        if (kind) changed(kind)
        for (const l of listeners) l(before, next)
        return next
      }),
    /** Hear about every write, with what the store held before it. Every write goes through `update`. */
    listen: (fn: (before: T, after: T) => void): (() => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

export const chatStore = store<ChatEntry[]>('chat.json', () => [])
// The story bible: Markdown files under bible/ hold the words, and
// .cyberkitty/bible.json holds what Markdown cannot (see src/shared/biblemd.ts).
// Every read heals the sidecar against the files, so edits made in another
// editor count; every update writes the files again.

interface BibleSidecar {
  version: 2
  entries: BibleEntry[]
  written: Written
}

async function loadBible(): Promise<BibleSidecar> {
  const raw = await requireBook().readJson<BibleSidecar | BibleEntry[]>('bible.json', [])
  // Books from before the Markdown bible kept a bare list.
  if (Array.isArray(raw)) return { version: 2, entries: raw, written: {} }
  return { version: 2, entries: raw.entries ?? [], written: raw.written ?? {} }
}

async function readBibleFiles(): Promise<Map<BibleType, string | null>> {
  const b = requireBook()
  const out = new Map<BibleType, string | null>()
  for (const { type } of BIBLE_TYPES) out.set(type, await b.readText(`${BIBLE_DIR}/${BIBLE_FILES[type]}`))
  return out
}

async function writeBibleFiles(entries: BibleEntry[], files: Map<BibleType, string | null>): Promise<Written> {
  const b = requireBook()
  const titles = new Map((await b.scenes()).map((s) => [s.id, s.title]))
  const written: Written = {}
  for (const { type } of BIBLE_TYPES) {
    const { text, lines } = renderBibleFile(type, entries, (id) => titles.get(id) ?? id)
    Object.assign(written, lines)
    const cur = files.get(type) ?? null
    if (cur === text || (cur === null && !Object.keys(lines).length)) continue
    await fs.mkdir(b.abs(BIBLE_DIR), { recursive: true })
    await atomicWrite(b.abs(`${BIBLE_DIR}/${BIBLE_FILES[type]}`), text)
  }
  return written
}

function bibleStoreOf() {
  const file = 'bible.json'
  const listeners = new Set<(before: BibleEntry[], after: BibleEntry[]) => void>()
  const notify = (before: BibleEntry[], after: BibleEntry[]): void => {
    for (const l of listeners) l(before, after)
  }
  const healed = async (): Promise<{ before: BibleEntry[]; files: Map<BibleType, string | null>; entries: BibleEntry[]; written: Written; changed: boolean }> => {
    const side = await loadBible()
    const files = await readBibleFiles()
    const h = healBible(side.entries, side.written, files, () => newId('b'))
    return { before: side.entries, files, ...h }
  }
  return {
    read: (): Promise<BibleEntry[]> =>
      serial(file, async () => {
        const h = await healed()
        if (h.changed) {
          // Record what the files say now; the files themselves are left as the author wrote them.
          await requireBook().writeJson(file, { version: 2, entries: h.entries, written: h.written })
          changed('bible')
          notify(h.before, h.entries)
        }
        return h.entries
      }),
    update: (fn: (cur: BibleEntry[]) => BibleEntry[] | Promise<BibleEntry[]>): Promise<BibleEntry[]> =>
      serial(file, async () => {
        const h = await healed()
        const next = await fn(structuredClone(h.entries))
        const written = await writeBibleFiles(next, h.files)
        await requireBook().writeJson(file, { version: 2, entries: next, written })
        changed('bible')
        notify(h.before, next)
        return next
      }),
    /** Hear about every change, including edits to the files made elsewhere, with the entries before and after. */
    listen: (fn: (before: BibleEntry[], after: BibleEntry[]) => void): (() => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

export const bibleStore = bibleStoreOf()
export const summaryStore = store<Record<string, SceneSummary>>('summaries.json', () => ({}), 'summaries')
export const alertStore = store<Alert[]>('alerts.json', () => [], 'alerts')
export const changeStore = store<ChangeSpec[]>('changes.json', () => [], 'changes')
export const diagramStore = store<Diagram[]>('diagrams.json', () => [], 'diagrams')

export async function logCorrection(c: Correction): Promise<void> {
  if (!c.before.trim() || c.before.trim() === c.after.trim()) return
  const p = requireBook().abs(path.join(META, 'corrections.jsonl'))
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.appendFile(p, JSON.stringify(c) + '\n')
}

/** The most recent before-and-after pairs, newest last. */
export async function recentCorrections(n = 12): Promise<Correction[]> {
  try {
    const raw = await fs.readFile(requireBook().abs(path.join(META, 'corrections.jsonl')), 'utf8')
    return raw
      .split('\n')
      .filter(Boolean)
      .slice(-n)
      .map((l) => JSON.parse(l) as Correction)
  } catch {
    return []
  }
}

export async function correctionCount(): Promise<number> {
  try {
    const raw = await fs.readFile(requireBook().abs(path.join(META, 'corrections.jsonl')), 'utf8')
    return raw.split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}
