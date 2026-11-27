// App data kept beside the book under .cyberkitty/. Derived data (bible
// entries from the text, summaries) can be rebuilt from the Markdown;
// sidecar-like data (chat, alerts, dismissals) heals or falls back safely.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Alert, BibleEntry, ChangeSpec, ChatEntry, Correction, Diagram, SceneSummary } from '@shared/types'
import { META } from './project'
import { requireBook, send } from './state'

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
export const bibleStore = store<BibleEntry[]>('bible.json', () => [], 'bible')
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
