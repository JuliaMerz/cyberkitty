// What every page can reach: navigation, the chat's attachments and place,
// the author's settings, and a registry of open editors (for counts, links
// that wear their target's mark, and revealing a quoted passage).

import { createContext, useContext } from 'react'
import type { EditorView } from '@codemirror/view'
import { resolveAnchor } from '@shared/anchors'
import { docKey, type DocRef, type MarkKind, type NavTarget, type PassageRef, type Place, type Settings } from '@shared/types'
import { liveMarks } from './editor/marks'

export interface AppApi {
  navigate: (t: NavTarget) => void
  attach: (p: PassageRef) => void
  setPlace: (p: Place) => void
  settings: Settings
  ban: string[]
  sceneTitle: (sceneId: string) => string
  noteTitle: (noteId: string) => string
}

export const AppCtx = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const v = useContext(AppCtx)
  if (!v) throw new Error('AppCtx missing')
  return v
}

// ---- Open editors -------------------------------------------------------------

const editors = new Map<string, { view: EditorView; ref: DocRef; flush: () => Promise<void> }>()
const listeners = new Set<() => void>()

export function registerEditor(ref: DocRef, view: EditorView, flush: () => Promise<void>): () => void {
  const key = docKey(ref)
  editors.set(key, { view, ref, flush })
  publish()
  return () => {
    if (editors.get(key)?.view === view) editors.delete(key)
    publish()
  }
}

function publish(): void {
  window.ck.setOpenDocs([...editors.keys()])
  for (const l of listeners) l()
}

/** Save every editor's held-back typing and marks now. */
export async function flushEditors(): Promise<void> {
  await Promise.all([...editors.values()].map((e) => e.flush().catch(() => undefined)))
}

// The main process asks before anything that reads the book: a Claude call,
// closing or switching the book, quitting.
window.ck.onFlushEditors((id) => {
  void flushEditors().finally(() => window.ck.editorsFlushed(id))
})

export function onEditorsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function editorFor(ref: DocRef): EditorView | null {
  return editors.get(docKey(ref))?.view ?? null
}

/** Find a quote in a document's text: exact, then tolerant of quote styles, then fuzzy. */
export function findQuote(text: string, quote: string): { from: number; to: number } | null {
  if (!quote) return null
  const i = text.indexOf(quote)
  if (i >= 0) return { from: i, to: i + quote.length }
  const norm = (s: string): string => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  const j = norm(text).indexOf(norm(quote))
  if (j >= 0) return { from: j, to: j + quote.length }
  const r = resolveAnchor(text, { quote, prefix: '', suffix: '', offset: 0 })
  return r ? { from: r.from, to: r.to } : null
}

/** The mark a link's target wears right now, if its editor is open. */
export function markAt(ref: DocRef, quote?: string): MarkKind | null {
  const view = editorFor(ref)
  if (!view || !quote) return null
  const at = findQuote(view.state.doc.toString(), quote)
  if (!at) return null
  const hit = liveMarks(view.state).find((m) => m.from <= at.to && m.to >= at.from)
  return hit?.record.kind ?? null
}

export function refLabel(ref: DocRef, app: Pick<AppApi, 'sceneTitle' | 'noteTitle'>): string {
  if (ref.kind === 'note') return `${app.noteTitle(ref.id)}, a note`
  if (ref.kind === 'scene') return `${app.sceneTitle(ref.sceneId)}${ref.file === 'notes' ? ', notes' : ''}`
  if (ref.kind === 'chapter') return 'Chapter intent'
  return ref.name.replace(/\.md$/, '').replace(/^./, (c) => c.toUpperCase())
}
