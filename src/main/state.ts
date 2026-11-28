// What the main process knows about the open book, shared by its modules.

import type { BrowserWindow } from 'electron'
import { docKey, type DocRef, type JobStatus, type MarkRecord, type Place } from '@shared/types'
import type { Book } from './project'
import type { History } from './history'

export const state: {
  win: BrowserWindow | null
  book: Book | null
  history: History | null
  /** What the app itself last wrote to each file, so the watcher can ignore our own writes. */
  lastWritten: Map<string, string>
  /** Documents open in the UI. Marks for them go through the UI, which owns their sidecar while open. */
  openDocs: Set<string>
  /** Where the author is, from their last activity. */
  place: Place
  lastActivity: number
  /** Called when the book's tree may have changed (counts, new files). */
  onDirty: (() => void) | null
} = {
  win: null,
  book: null,
  history: null,
  lastWritten: new Map(),
  openDocs: new Set(),
  place: { label: 'nowhere yet', page: 'none' },
  lastActivity: Date.now(),
  onDirty: null
}

export function send(channel: string, ...args: unknown[]): void {
  if (channel === 'book-dirty') {
    state.onDirty?.()
    return
  }
  if (state.win && !state.win.isDestroyed()) state.win.webContents.send(channel, ...args)
}

const flushWaiters = new Map<number, () => void>()
let flushSeq = 0

/**
 * Ask the UI to save the typing it is still holding back (an editor saves
 * 400ms after the last keystroke), so what is on disk is what the author sees.
 * Resolves once the UI says it is done, or after a short wait.
 */
export function flushUi(timeoutMs = 1500): Promise<void> {
  const win = state.win
  if (!win || win.isDestroyed()) return Promise.resolve()
  const id = ++flushSeq
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      flushWaiters.delete(id)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    flushWaiters.set(id, done)
    win.webContents.send('flush-editors', id)
  })
}

export function uiFlushed(id: number): void {
  flushWaiters.get(id)?.()
}

export function requireBook(): Book {
  if (!state.book) throw new Error('No book is open.')
  return state.book
}

/** Write a document on the author's behalf, remembering it so the watcher stays quiet. */
export async function writeDoc(ref: DocRef, text: string): Promise<void> {
  const b = requireBook()
  state.lastWritten.set(b.docPath(ref), text)
  await b.writeDoc(ref, text)
  // An open editor must see a change it did not make.
  if (state.openDocs.has(docKey(ref))) send('file-changed', { key: docKey(ref), text })
}

/** Put marks on a document: through the UI if it is open there, else into its sidecar. */
export async function addMarks(ref: DocRef, records: MarkRecord[]): Promise<void> {
  if (!records.length) return
  const key = docKey(ref)
  if (state.openDocs.has(key)) send('marks-added', { key, records })
  else await requireBook().addDocMarks(ref, records)
  send('book-dirty')
}

export function job(status: JobStatus): void {
  send('job', status)
}

let seq = 0
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`
}
