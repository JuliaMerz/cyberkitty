// The tell detector's rule pass: known Claude tells plus the author's ban
// list. Flags are faint dotted underlines; a model pass can add more later.

/** Known Claude tells, as case-insensitive regular expressions. */
export const BUILTIN_TELLS: string[] = [
  "\\bdelve[sd]?\\b",
  "\\btapestry\\b",
  "\\ba testament to\\b",
  "\\bpalpable\\b",
  "\\bunspoken\\b",
  "\\bozone\\b",
  "\\bthe weight of\\b",
  "\\b(couldn't|could not) help but\\b",
  "breath (she|he|they|I) (didn't|did not) know",
  "\\bbarely above a whisper\\b",
  "\\ba beat\\b",
  "\\bsomething shifted\\b",
  "\\bshifted (in|on) (her|his|their|my) (seat|chair|feet)\\b",
  "\\b(the )?air (was )?thick with\\b",
  "\\ba mix(ture)? of \\w+ and \\w+\\b",
  "\\bsent (a )?shivers? down\\b",
  "\\bjaw (tightened|clenched)\\b",
  "\\b(her|his|their|my) eyes (widened|softened|narrowed)\\b",
  "\\blet out a breath\\b",
  "\\bknuckles (went )?white\\b",
  "\\bthe silence stretched\\b",
  "\\bhung in the air\\b",
  "\\bin that moment\\b",
  "\\bfor a long moment\\b",
  "\\bsomething (like|akin to) \\w+\\b",
  "\\bthe ghost of a smile\\b",
  "\\bwhat felt like (an eternity|forever|hours)\\b",
  "\\bdespite (herself|himself|themselves|myself)\\b",
  "\\ba (small|soft|quiet) smile\\b",
  "\\bmaybe,? just maybe\\b",
  "\\bnot unkindly\\b",
  "\\bthe kind of \\w+ that\\b",
  "\\b(it|this|that) (wasn't|was not|isn't|is not) [^.?!]{1,40}[.;,] (it|this|that) (was|is)\\b",
  "\\bnot (just |only |because )?[^,.;]{1,30}, but\\b",
  "(?:(?<=[.!?] )|^)(?!(?:Mr|Mrs|Ms|Dr|St)\\.)[A-Z]\\w+\\. [A-Z]\\w+\\. [A-Z]\\w+\\."
]

/** Bullets under the style page's "Ban list" heading. */
export function banList(styleMd: string | null): string[] {
  if (!styleMd) return []
  const m = /^#{1,6}\s*ban list\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/im.exec(styleMd)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((l) => /^\s*[-*+]\s+(.+)$/.exec(l)?.[1]?.trim() ?? '')
    .filter(Boolean)
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface TellHit {
  from: number
  to: number
  text: string
  rule: string
}

let cache: { key: string; res: RegExp[] } | null = null

export function tellPatterns(ban: string[]): RegExp[] {
  const key = ban.join('\u0000')
  if (cache?.key === key) return cache.res
  const res: RegExp[] = []
  for (const phrase of ban) res.push(new RegExp(`\\b${escape(phrase)}\\b`, 'gi'))
  for (const p of BUILTIN_TELLS) {
    try {
      res.push(new RegExp(p, 'gim'))
    } catch {
      // a pattern this engine cannot read is skipped
    }
  }
  cache = { key, res }
  return res
}

export function findTells(text: string, ban: string[]): TellHit[] {
  const hits: TellHit[] = []
  for (const re of tellPatterns(ban)) {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      hits.push({ from: m.index, to: m.index + m[0].length, text: m[0], rule: re.source })
    }
  }
  hits.sort((a, b) => a.from - b.from || b.to - a.to)
  const out: TellHit[] = []
  for (const h of hits) if (!out.length || h.from >= out[out.length - 1].to) out.push(h)
  return out
}
