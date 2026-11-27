// Edits as Claude reads them in the event log: which paragraphs of a
// document changed, each given in full as it reads now, with what it replaced.
// Paragraphs are non-empty lines (a Markdown paragraph is one line; so is a
// list item in notes), compared with a longest-common-subsequence diff.

export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

interface Run {
  same: boolean
  before: string[]
  after: string[]
}

function diff(a: string[], b: string[]): Run[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const runs: Run[] = []
  const push = (same: boolean, x?: string, y?: string): void => {
    let last = runs.at(-1)
    if (!last || last.same !== same) {
      last = { same, before: [], after: [] }
      runs.push(last)
    }
    if (x !== undefined) last.before.push(x)
    if (y !== undefined) last.after.push(y)
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) push(true, a[i++], b[j++])
    else if (dp[i + 1][j] >= dp[i][j + 1]) push(false, a[i++], undefined)
    else push(false, undefined, b[j++])
  }
  while (i < n) push(false, a[i++], undefined)
  while (j < m) push(false, undefined, b[j++])
  return runs
}

function snippet(s: string, max = 60): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`
}

/**
 * The changed paragraphs of one document, one line each, or [] when nothing
 * changed. `tag` can label a paragraph as it reads now (for example as
 * Claude's unreviewed words).
 */
export function describeEdits(before: string, after: string, tag: (paragraph: string) => string = () => ''): string[] {
  const a = lines(before)
  const b = lines(after)
  const out: string[] = []
  let prev: string | null = null
  for (const run of diff(a, b)) {
    if (run.same) {
      prev = run.after.at(-1) ?? prev
      continue
    }
    const pairs = Math.min(run.before.length, run.after.length)
    for (let k = 0; k < pairs; k++) {
      out.push(`- now reads: “${run.after[k]}”${tag(run.after[k])} (was: “${run.before[k]}”)`)
      prev = run.after[k]
    }
    const added = run.after.slice(pairs)
    if (added.length) {
      const where = prev === null ? 'at the start' : `after “${snippet(prev)}”`
      out.push(added.length === 1 ? `- added ${where}: “${added[0]}”${tag(added[0])}` : `- added ${where}:\n${added.map((p) => `  “${p}”${tag(p)}`).join('\n')}`)
      prev = added[added.length - 1]
    }
    for (let k = pairs; k < run.before.length; k++) out.push(`- removed: “${run.before[k]}”`)
  }
  return out
}
