// Paragraph diffs for reviewing a chapter-scale change.

export interface Hunk {
  kind: 'same' | 'change'
  before: string[]
  after: string[]
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Longest common subsequence over paragraphs, grouped into unchanged runs and changes. */
export function diffParagraphs(a: string[], b: string[]): Hunk[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const hunks: Hunk[] = []
  const push = (kind: Hunk['kind'], before: string[], after: string[]): void => {
    const last = hunks.at(-1)
    if (last && last.kind === kind) {
      last.before.push(...before)
      last.after.push(...after)
    } else hunks.push({ kind, before: [...before], after: [...after] })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', [a[i]], [b[j]])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('change', [a[i++]], [])
    else push('change', [], [b[j++]])
  }
  while (i < n) push('change', [a[i++]], [])
  while (j < m) push('change', [], [b[j++]])
  return hunks
}

/** Rebuild the scene from per-hunk choices: true takes the rewrite, false keeps the original. */
export function applyChoices(hunks: Hunk[], take: boolean[]): string {
  const out: string[] = []
  hunks.forEach((h, i) => out.push(...(h.kind === 'same' ? h.before : take[i] ? h.after : h.before)))
  return out.join('\n\n') + '\n'
}
