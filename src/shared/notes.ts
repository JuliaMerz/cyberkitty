// Conventions in a scene's notes and prose. There is no syntax to learn; these
// are the two optional habits the spec names.

/**
 * Pinned wording: a line in the notes that is only a quotation, such as a line
 * of dialogue the author loves. The draft must use it verbatim. Accepts a
 * bullet or a plain line wrapped in straight or curly double quotes, and
 * Markdown blockquotes.
 */
export function pinnedLines(notes: string): string[] {
  const out: string[] = []
  for (const raw of notes.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()
    const quoted = /^(["“])(.+)(["”])$/.exec(line)
    if (quoted && quoted[2].trim()) {
      out.push(quoted[2].trim())
      continue
    }
    const bq = /^>\s?(.+)$/.exec(raw.trim())
    if (bq && bq[1].trim()) out.push(bq[1].trim().replace(/^["“](.*)["”]$/, '$1'))
  }
  return out
}

/**
 * Pinned lines the prose does not contain, ignoring quote style, spacing and
 * closing punctuation (a pinned line often ends in a comma once a dialogue tag
 * follows it).
 */
export function missingPinned(pinned: string[], prose: string): string[] {
  const norm = (s: string): string =>
    s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
  const p = norm(prose)
  return pinned.filter((line) => !p.includes(norm(line).replace(/^"|"$/g, '').replace(/[.,!?;:…]+$/, '')))
}

/** A bracketed line in the prose is a gap to draft later, e.g. [she finds the letter]. */
export function gaps(prose: string): string[] {
  const out: string[] = []
  for (const m of prose.matchAll(/^\s*\[([^\]\n]+)\]\s*$/gm)) out.push(m[1].trim())
  return out
}

/** The first level-one heading, used as a title. */
export function firstHeading(md: string | null): string | null {
  if (!md) return null
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(md)
  return m ? m[1].trim() : null
}

/** Remove a leading heading and stray wrapper text from a writer's reply. */
export function cleanDraft(text: string): string {
  let t = text.replace(/^\s*#{1,6}\s+[^\n]*\n+/, '')
  t = t.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1')
  return t.trim()
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'untitled'
  )
}

export function humanize(slug: string): string {
  const s = slug.replace(/^\d+-/, '').replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
