// Export: the book as single Markdown files, to share, print, or take into
// another tool (Word and Google Docs open Markdown, and Pandoc converts it to
// anything). The book folder itself is already plain Markdown; these put it
// in reading order in one file.
//
// - Manuscript: the title, each chapter's heading, then its scenes' prose in
//   order, with a scene break between scenes. No notes of any kind, no scene
//   titles.
// - Notes and planning: the book pages, the Notes section, then each
//   chapter's intent and each scene's notes under the scene's title, with
//   woven notes in their place.
// - Story bible: the planned page, then the bible's Markdown files.

import { BIBLE_DIR, BIBLE_FILES } from '@shared/biblemd'
import { BIBLE_TYPES, DIRECTION_PAGES } from '@shared/types'
import type { Book } from './project'
import { stripHeading } from './project'

export type ExportKind = 'manuscript' | 'notes' | 'bible'

export const EXPORT_NAMES: Record<ExportKind, string> = {
  manuscript: 'manuscript',
  notes: 'notes and planning',
  bible: 'story bible'
}

const SCENE_BREAK = '* * *'

/** A document's body under a heading of the export: its own title dropped, its headings moved down `levels` (a page's ## under an export ## becomes ###). */
export function nest(md: string, levels: number): string {
  return stripHeading(md)
    .split('\n')
    .map((line) => {
      const h = /^(#{1,6})(\s.*)$/.exec(line)
      return h ? `${'#'.repeat(Math.min(6, h[1].length + levels))}${h[2]}` : line
    })
    .join('\n')
    .trim()
}

function join(parts: string[]): string {
  return `${parts.filter((p) => p.trim()).join('\n\n').trim()}\n`
}

export async function manuscriptMarkdown(b: Book): Promise<string> {
  const tree = await b.tree()
  const scenes = await b.scenes()
  const out = [`# ${tree.title}`]
  for (const c of tree.chapters) {
    const prose = scenes.filter((s) => s.chapterId === c.id).map((s) => nest(s.prose ?? '', 1)).filter(Boolean)
    if (!prose.length) continue
    out.push(`## ${c.title}`, prose.join(`\n\n${SCENE_BREAK}\n\n`))
  }
  return join(out)
}

export async function notesMarkdown(b: Book): Promise<string> {
  const tree = await b.tree()
  const scenes = await b.scenes()
  const out = [`# ${tree.title}: notes and planning`]
  const book = nest(await b.readPage('book.md'), 0)
  if (book) out.push(book)
  for (const p of DIRECTION_PAGES) {
    const body = nest(await b.readPage(p.name), 1)
    if (body) out.push(`## ${p.title}`, body)
  }
  const planned = nest(await b.readPage('bible.md'), 1)
  if (planned && planned.replace(/^-\s*$/gm, '').trim()) out.push('## Planned bible', planned)
  const notes = await b.notes()
  const note = (id: string, level: number): string[] => {
    const n = notes.find((x) => x.id === id)
    if (!n) return []
    const body = nest(n.text, level - 1)
    return [`${'#'.repeat(level)} Note: ${n.title}`, ...(body ? [body] : [])]
  }
  if (tree.notes.length) {
    out.push('## Notes')
    let folder = 'notes'
    for (const n of tree.notes) {
      if (n.folder !== folder) {
        folder = n.folder
        out.push(`### ${folder.slice('notes/'.length)}`)
      }
      const body = nest(notes.find((x) => x.id === n.id)?.text ?? '', folder === 'notes' ? 2 : 3)
      out.push(`${folder === 'notes' ? '###' : '####'} ${n.title}`, ...(body ? [body] : []))
    }
  }
  for (const id of tree.order) {
    const c = tree.chapters.find((x) => x.id === id)
    if (!c) {
      out.push(...note(id, 2))
      continue
    }
    out.push(`## Chapter ${c.number}: ${c.title}`)
    const intent = nest((await b.readText(`${c.id}/chapter.md`)) ?? '', 1)
    if (intent) out.push(intent)
    for (const item of c.order) {
      const s = scenes.find((x) => x.id === item)
      if (!s) {
        out.push(...note(item, 3))
        continue
      }
      out.push(`### ${s.title}`)
      const sceneNotes = nest(s.notes ?? '', 2)
      if (sceneNotes) out.push(sceneNotes)
    }
  }
  return join(out)
}

export async function bibleMarkdown(b: Book): Promise<string> {
  const out = [`# ${await b.title()}: story bible`]
  const planned = nest(await b.readPage('bible.md'), 1)
  if (planned && planned.replace(/^-\s*$/gm, '').trim()) out.push('## Planned', planned)
  for (const { type, title } of BIBLE_TYPES) {
    const body = nest((await b.readText(`${BIBLE_DIR}/${BIBLE_FILES[type]}`)) ?? '', 1)
    if (body) out.push(`## ${title}`, body)
  }
  return join(out)
}

export function exportMarkdown(b: Book, kind: ExportKind): Promise<string> {
  return kind === 'manuscript' ? manuscriptMarkdown(b) : kind === 'notes' ? notesMarkdown(b) : bibleMarkdown(b)
}
