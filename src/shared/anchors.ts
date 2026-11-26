// Self-healing anchors. A sidecar record points at text by the words it covers,
// never by an id in the Markdown. When the file changes, inside the app or
// outside it, each record is re-attached: an exact match first (preferring the
// one whose surroundings and position fit best), then the closest similar
// paragraph. Anything that cannot be matched is dropped, which is the safe
// default: unmatched text counts as the author's, and as reviewed.

import type { Anchor, MarkRecord } from './types'

const CONTEXT = 40

export function makeAnchor(text: string, from: number, to: number): Anchor {
  return {
    quote: text.slice(from, to),
    prefix: text.slice(Math.max(0, from - CONTEXT), from),
    suffix: text.slice(to, to + CONTEXT),
    offset: from
  }
}

export type ResolveHow = 'exact' | 'fuzzy'

export interface Resolved {
  from: number
  to: number
  how: ResolveHow
}

/** Find where an anchor's words are now. Returns null when they are gone. */
export function resolveAnchor(text: string, anchor: Anchor): Resolved | null {
  if (!anchor.quote) return null
  const exact = bestExact(text, anchor)
  if (exact !== null) return { from: exact, to: exact + anchor.quote.length, how: 'exact' }
  const para = bestParagraph(text, anchor.quote)
  if (para) return { ...para, how: 'fuzzy' }
  return null
}

function bestExact(text: string, anchor: Anchor): number | null {
  let best: number | null = null
  let bestScore = -Infinity
  for (let i = text.indexOf(anchor.quote); i !== -1; i = text.indexOf(anchor.quote, i + 1)) {
    const before = text.slice(Math.max(0, i - CONTEXT), i)
    const after = text.slice(i + anchor.quote.length, i + anchor.quote.length + CONTEXT)
    const contextScore = commonSuffix(before, anchor.prefix) + commonPrefix(after, anchor.suffix)
    // Context decides between repeats; distance from the old spot breaks ties.
    const score = contextScore * 1000 - Math.abs(i - anchor.offset) / 1000
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function commonPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

function commonSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

export interface Paragraph {
  from: number
  to: number
  text: string
}

/** Paragraphs are runs of non-blank lines. Offsets exclude surrounding whitespace. */
export function paragraphs(text: string): Paragraph[] {
  const out: Paragraph[] = []
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[0]
    if (!raw.trim()) continue
    const lead = raw.length - raw.trimStart().length
    const body = raw.trim()
    out.push({ from: m.index + lead, to: m.index + lead + body.length, text: body })
  }
  return out
}

const FUZZY_MIN = 0.6

/**
 * The paragraph most like the quote, when the quote was about a paragraph's
 * worth of text and the paragraph is still recognisably the same one.
 */
function bestParagraph(text: string, quote: string): { from: number; to: number } | null {
  const q = trigrams(quote)
  let best: Paragraph | null = null
  let bestScore = 0
  for (const p of paragraphs(text)) {
    const ratio = Math.min(p.text.length, quote.length) / Math.max(p.text.length, quote.length)
    if (ratio < 0.5) continue
    const score = dice(q, trigrams(p.text))
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best && bestScore >= FUZZY_MIN ? { from: best.from, to: best.to } : null
}

function trigrams(s: string): Map<string, number> {
  const norm = s.toLowerCase().replace(/\s+/g, ' ')
  const m = new Map<string, number>()
  for (let i = 0; i + 3 <= norm.length; i++) {
    const g = norm.slice(i, i + 3)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0
  let total = 0
  for (const [g, n] of a) {
    inter += Math.min(n, b.get(g) ?? 0)
    total += n
  }
  for (const n of b.values()) total += n
  return total === 0 ? 0 : (2 * inter) / total
}

export interface HealResult {
  marks: MarkRecord[]
  ranges: Map<string, Resolved>
  dropped: MarkRecord[]
}

/**
 * Re-attach every mark for one file to its current text. Marks that moved get
 * fresh anchors; marks whose words are gone are dropped.
 */
export function healMarks(text: string, marks: MarkRecord[]): HealResult {
  const kept: MarkRecord[] = []
  const dropped: MarkRecord[] = []
  const ranges = new Map<string, Resolved>()
  const taken: Array<[number, number]> = []
  for (const mark of marks) {
    // A suggestion is not in the file. Its anchor is the text it would replace.
    const r = resolveAnchor(text, mark.anchor)
    // Two in-file marks never share words; a suggestion may sit over one.
    const inFile = mark.kind !== 'suggested'
    if (!r || (inFile && taken.some(([f, t]) => r.from < t && f < r.to))) {
      dropped.push(mark)
      continue
    }
    if (inFile) taken.push([r.from, r.to])
    ranges.set(mark.id, r)
    kept.push({ ...mark, anchor: makeAnchor(text, r.from, r.to) })
  }
  return { marks: kept, ranges, dropped }
}
