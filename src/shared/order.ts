// Reading order in the manuscript comes from file names, as it always has:
// chapters and scenes are numbered (01-the-harbor, 02-arrival) and sort by
// name. A note woven in among them needs a name that sorts into its place
// without renaming anything around it, so it takes the number of what it
// follows plus a letter or two: a note after scene 02 is 02n-…, one between
// that scene and the note is 02g-…, one before the first scene is 00n-….
// Letters come after the "-" of a plain number, so 02-… < 02g-… < 02n-… < 03-…
// in an ordinary name sort, the same sort a file browser or Obsidian shows.

const DIGITS = 'abcdefghijklmnopqrstuvwxyz'

interface Key {
  num: string
  letters: string
}

/** The order key at the start of a file or folder name: its number and any letters after it. */
export function orderKey(name: string): Key | null {
  const m = /^(\d+)([a-z]*)(?=-|\.|$)/.exec(name)
  return m ? { num: m[1], letters: m[2] } : null
}

/** A letter string strictly between a and b (b null: no upper bound). Never ends in "a", so there is always room. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0
    while ((a[n] ?? 'a') === b[n]) n++
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0
  const db = b ? DIGITS.indexOf(b[0]) : DIGITS.length
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]
  if (b && b.length > 1) return b.slice(0, 1)
  return DIGITS[da] + midpoint(a.slice(1), null)
}

/**
 * The prefix for a new name between two neighbours (their names; null at
 * either end), e.g. "02n". Falls back to just after `prev` when the
 * neighbours leave no room or are not numbered.
 */
export function keyBetween(prev: string | null, next: string | null): string {
  const p = prev === null ? { num: '00', letters: '' } : orderKey(prev)
  const n = next === null ? null : orderKey(next)
  // An unnumbered name (an outside-made "prologue"): sort right after it.
  if (!p) return `${prev}n`
  let key: string
  if (!n || Number(n.num) > Number(p.num)) key = p.num + midpoint(p.letters, null)
  else if (n.num === p.num && n.letters > p.letters) key = p.num + midpoint(p.letters, n.letters)
  else key = p.num + midpoint(p.letters, null)
  // Outside-made names can leave no room; then the new name goes just after prev.
  const fits = (k: string): boolean => (prev === null || `${k}-` > prev) && (next === null || `${k}-` < next)
  if (!fits(key)) key = p.num + midpoint(p.letters, null)
  return key
}

/** Names in reading order. */
export function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
