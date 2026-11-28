// Links to places in the book, used by chat, alerts and the bible. Claude
// writes them as Markdown links; the app resolves the quote by matching text,
// the same way sidecar anchors heal.

import type { DocRef, NavTarget, PageName, SceneFile } from './types'

export function linkFor(ref: DocRef | { kind: 'alert'; id: string } | { kind: 'change'; id: string } | { kind: 'bible'; id?: string }, quote?: string): string {
  const q = quote ? `?q=${encodeURIComponent(quote)}` : ''
  switch (ref.kind) {
    case 'scene':
      return `ck:scene/${encodeURIComponent(ref.sceneId)}${q}${ref.file === 'notes' ? (q ? '&' : '?') + 'f=notes' : ''}`
    case 'chapter':
      return `ck:chapter/${encodeURIComponent(ref.chapterId)}`
    case 'page':
      return `ck:page/${encodeURIComponent(ref.name)}${q}`
    case 'note':
      return `ck:note/${encodeURIComponent(ref.id)}${q}`
    case 'alert':
      return `ck:alert/${encodeURIComponent(ref.id)}`
    case 'change':
      return `ck:change/${encodeURIComponent(ref.id)}`
    case 'bible':
      return `ck:bible/${encodeURIComponent(ref.id ?? '')}`
  }
}

export function parseLink(href: string): NavTarget | null {
  const m = /^ck:([a-z]+)\/([^?]*)(?:\?(.*))?$/.exec(href.trim())
  if (!m) return null
  const [, kind, rawId, query] = m
  const id = safeDecode(rawId)
  const params = new URLSearchParams(query ?? '')
  const quote = params.get('q') ?? undefined
  switch (kind) {
    case 'scene':
      return { kind: 'scene', sceneId: id, file: (params.get('f') as SceneFile) ?? undefined, quote }
    case 'chapter':
      return { kind: 'chapter', chapterId: id }
    case 'page':
      return { kind: 'page', name: id as PageName, quote }
    case 'note':
      return { kind: 'note', id, quote }
    case 'alert':
      return { kind: 'alerts', id }
    case 'change':
      return { kind: 'change', id }
    case 'bible':
      return { kind: 'bible', id: id || undefined }
    case 'timeline':
      return { kind: 'timeline' }
    default:
      return null
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
