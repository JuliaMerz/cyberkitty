// Prompts for the writer lane. The writer produces every sentence meant for
// the book. It gets the style page first (so it is cached), then the story
// around the passage, then the notes to draft from.

export const WRITER_INSTRUCTIONS = `You are the writer in CyberKitty, an app where an author and Claude write a novel together. The author owns the book and its voice. Your job is to put the author's plans into prose that reads as if the author wrote it.

The style page below is the most important thing you will read. Match its samples in rhythm, sentence length, diction, point of view, tense, how dialogue is handled and what is left unsaid. Where the description and the samples disagree, follow the samples. Never use anything on the ban list.

Write the way this author writes, not the way an assistant writes. In particular, avoid explaining a feeling the scene already shows, closing a paragraph on a neat summarising line, stacking three images where one would do, and stock phrasing such as "something shifted", "a breath she didn't know she was holding" or "the weight of". Prefer the concrete, specific detail this character would notice.

Follow the notes. Each beat should happen, in order, unless the notes say otherwise. Lines in the notes that are only a quotation are pinned wording: use each one verbatim, word for word. Do not add events, characters or facts the notes and the story so far do not support. Small staging details are fine.

Reply with the prose only: Markdown paragraphs separated by blank lines, with no heading, no title, no commentary and no notes to the author.`

export interface WriterContext {
  bookTitle: string
  styleMd: string | null
  /** Earlier scenes in this chapter, oldest first. */
  chapterSoFar: Array<{ title: string; prose: string }>
  sceneTitle: string
  notes: string
  beats?: string
  proseBefore: string
  proseAfter: string
  pinned: string[]
}

export interface WriterPrompt {
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  user: string
}

export function buildWriterPrompt(ctx: WriterContext): WriterPrompt {
  const style = ctx.styleMd?.trim()
    ? ctx.styleMd.trim()
    : '(The author has not filled in the style page yet. Write plain, unshowy prose and keep it close to the notes.)'

  const system = [
    { type: 'text' as const, text: WRITER_INSTRUCTIONS },
    {
      type: 'text' as const,
      text: `<style_page>\n${style}\n</style_page>`,
      cache_control: { type: 'ephemeral' as const }
    }
  ]

  const parts: string[] = []
  parts.push(`<book title="${escapeAttr(ctx.bookTitle)}" />`)
  if (ctx.chapterSoFar.length) {
    parts.push(
      '<chapter_so_far>\n' +
        ctx.chapterSoFar
          .map((s) => `<scene title="${escapeAttr(s.title)}">\n${s.prose.trim()}\n</scene>`)
          .join('\n') +
        '\n</chapter_so_far>'
    )
  }
  parts.push(`<scene_notes title="${escapeAttr(ctx.sceneTitle)}">\n${ctx.notes.trim()}\n</scene_notes>`)

  const before = stripTitle(ctx.proseBefore).trim()
  const after = ctx.proseAfter.trim()
  if (before || after) {
    parts.push(
      '<scene_prose>\n' +
        (before ? before + '\n' : '') +
        '<<< WRITE HERE >>>' +
        (after ? '\n' + after : '') +
        '\n</scene_prose>'
    )
  }

  const task: string[] = []
  if (ctx.beats && ctx.beats.trim()) {
    task.push(`Draft only these beats from the notes:\n${ctx.beats.trim()}`)
  } else {
    task.push('Draft the scene from its notes.')
  }
  if (before || after) {
    task.push(
      'Your prose goes where <<< WRITE HERE >>> is. Continue seamlessly from what comes before it' +
        (after ? ' and lead naturally into what comes after it. Do not repeat either.' : ', and do not repeat it.')
    )
  }
  if (ctx.pinned.length) {
    task.push(
      'Pinned wording that must appear verbatim, if its beat is part of this draft:\n' +
        ctx.pinned.map((p) => `- ${p}`).join('\n')
    )
  }
  parts.push(`<task>\n${task.join('\n\n')}\n</task>`)

  return { system, user: parts.join('\n\n') }
}

function stripTitle(prose: string): string {
  return prose.replace(/^\s*#\s+[^\n]*\n*/, '')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
