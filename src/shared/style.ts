// The style page as a new book starts it, and the style page as the writer
// should read it. A new book's style.md holds instructions for the author
// ("Paste a few thousand words…") under each heading; until the author
// replaces them, those instructions are not the author's style, so the writer
// and the planner get the page without them. The starter ban list is kept: it
// is real advice, and the author can edit it like any other line.

const SAMPLES_HINT =
  'Paste a few thousand words of your own prose here. A finished short story is a good start. Claude matches these more closely than anything you write about them.'
const DESCRIPTION_HINT = 'How your prose works: rhythm, diction, point of view and tense, dialogue, imagery, and what you never do.'

export const STYLE_TEMPLATE = `# Style

## Samples

${SAMPLES_HINT}

## Description

${DESCRIPTION_HINT}

## Ban list

- something shifted
- a breath she didn't know she was holding
- the weight of
- testament to
- couldn't help but
`

const HINTS = [SAMPLES_HINT, DESCRIPTION_HINT]
const HEADING = /^#{1,6}\s[^\n]*\n?/

/** The style page without the starter instructions, and without sections they leave empty. Empty when nothing is left. */
export function filledStyle(md: string | null): string {
  if (!md) return ''
  let text = md.replace(/\r\n/g, '\n')
  for (const hint of HINTS) text = text.split(hint).join('')
  const sections = text.split(/(?=^#{1,6}\s)/m).filter((s) => !HEADING.test(s) || s.replace(HEADING, '').trim() || /^#\s/.test(s))
  const out = sections.join('').replace(/\n{3,}/g, '\n\n').trim()
  return out.replace(/^#\s[^\n]*/, '').trim() ? out : ''
}

/** Whether the page says anything about the author's voice: samples or a description, not just a ban list. */
export function styleHasVoice(md: string | null): boolean {
  return !!filledStyle(md)
    .replace(/^#\s[^\n]*/, '')
    .replace(/^#{1,6}\s*ban list\s*$[\s\S]*?(?=^#{1,6}\s|(?![\s\S]))/im, '')
    .trim()
}
