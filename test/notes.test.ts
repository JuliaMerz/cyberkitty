import { describe, expect, it } from 'vitest'
import { cleanDraft, firstHeading, gaps, missingPinned, pinnedLines, slugify } from '@shared/notes'

describe('pinned wording', () => {
  const notes = `# Arrival

- She sees Tomas.
- "You look like your mother."
- “Curly quotes count too.”
> A blockquote line
- He said "hello" to her.`

  it('takes lines that are only a quotation', () => {
    expect(pinnedLines(notes)).toEqual(['You look like your mother.', 'Curly quotes count too.', 'A blockquote line'])
  })

  it('reports pinned lines the prose missed, ignoring quote style', () => {
    const prose = '“You look like your mother,” he said. A blockquote line.'
    expect(missingPinned(pinnedLines(notes), prose)).toEqual(['Curly quotes count too.'])
  })
})

describe('helpers', () => {
  it('finds gaps in prose', () => {
    expect(gaps('One.\n\n[she finds the letter]\n\nTwo [not a gap].')).toEqual(['she finds the letter'])
  })
  it('reads the first heading', () => {
    expect(firstHeading('intro\n# The Mill\n')).toBe('The Mill')
    expect(firstHeading(null)).toBeNull()
  })
  it('cleans a writer reply', () => {
    expect(cleanDraft('# Arrival\n\nThe ferry was late.\n')).toBe('The ferry was late.')
    expect(cleanDraft('```markdown\nThe ferry.\n```')).toBe('The ferry.')
  })
  it('slugifies titles', () => {
    expect(slugify('Tomas’s Boat!')).toBe('tomas-s-boat')
    expect(slugify('Ça va')).toBe('ca-va')
  })
})
