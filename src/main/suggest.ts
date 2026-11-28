// Suggestions: Claude's proposals that are not in the file yet. They wait in
// the sidecar, shown dashed and paler, until the author accepts or rejects.

import { makeAnchor, paragraphs, resolveAnchor } from '@shared/anchors'
import type { DocRef, MarkRecord } from '@shared/types'
import { addMarks, newId, requireBook } from './state'

export class QuoteNotFound extends Error {}

/** Find a quote in a document as it stands; tolerant of quote styles and spacing. */
export function locate(text: string, quote: string): { from: number; to: number } | null {
  if (!quote) return null
  const direct = text.indexOf(quote)
  if (direct >= 0) return { from: direct, to: direct + quote.length }
  const norm = (s: string): string => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  const n = norm(text).indexOf(norm(quote))
  if (n >= 0) return { from: n, to: n + quote.length }
  const r = resolveAnchor(text, { quote, prefix: '', suffix: '', offset: 0 })
  return r ? { from: r.from, to: r.to } : null
}

export async function suggest(args: {
  ref: DocRef
  quote: string
  replacement: string
  insert?: 'after'
  note: string
  source: MarkRecord['origin']['source']
  chatId?: string
}): Promise<MarkRecord> {
  const b = requireBook()
  const text = (await b.readDoc(args.ref)).text ?? ''
  let range: { from: number; to: number } | null
  if (args.insert === 'after' && !args.quote) {
    // At the end: anchor on the last paragraph.
    const last = paragraphs(text).at(-1)
    range = last ? { from: last.from, to: last.to } : null
    if (!range) throw new QuoteNotFound('The document is empty; there is nothing to place a suggestion after.')
  } else {
    range = locate(text, args.quote)
  }
  if (!range) throw new QuoteNotFound(`Could not find “${args.quote.slice(0, 80)}” in that document. Read it again and quote it exactly.`)
  const record: MarkRecord = {
    id: newId('s'),
    kind: 'suggested',
    file: args.ref.kind === 'scene' ? args.ref.file : 'prose',
    anchor: makeAnchor(text, range.from, range.to),
    origin: { source: args.source, note: args.note, at: new Date().toISOString(), chatId: args.chatId },
    replacement: args.replacement,
    insert: args.insert
  }
  await addMarks(args.ref, [record])
  return record
}
