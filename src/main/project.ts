// The book on disk: one folder of Markdown files. Markdown is the source of
// truth for every word; everything CyberKitty adds lives under .cyberkitty/.
//
//   book.md, summary.md, theme.md, tropes.md, characters.md, outline.md
//   style.md                                  the style page
//   bible.md                                  planned bible entries, by hand
//   manuscript/01-the-harbor/chapter.md       # The Harbor, then the chapter's intent
//   manuscript/01-the-harbor/01-arrival.md        prose only
//   manuscript/01-the-harbor/01-arrival.notes.md  the scratchpad
//   .cyberkitty/scenes/01-the-harbor/01-arrival.json   sidecar for both scene files
//   .cyberkitty/docs/<page>.json              sidecars for pages and chapters
//   .cyberkitty/*.json                        chat, bible, summaries, alerts, changes
//   .cyberkitty/history.git                   hidden snapshots

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { healMarks } from '@shared/anchors'
import { firstHeading, humanize, slugify } from '@shared/notes'
import type { BookTree, ChapterRef, DocContent, DocRef, MarkRecord, PageName, SceneFile, SceneRef, Sidecar } from '@shared/types'

export const MANUSCRIPT = 'manuscript'
export const META = '.cyberkitty'

const NOTES_EXT = '.notes.md'

export function emptySidecar(): Sidecar {
  return { version: 1, marks: [] }
}

export interface SceneText {
  id: string
  chapterId: string
  title: string
  prose: string | null
  notes: string | null
}

export class Book {
  constructor(public readonly root: string) {}

  static async isBook(dir: string): Promise<boolean> {
    return exists(path.join(dir, MANUSCRIPT))
  }

  /** Create a new, empty book in an existing folder. Nothing already there is changed. */
  static async create(dir: string, title: string): Promise<Book> {
    await fs.mkdir(path.join(dir, MANUSCRIPT), { recursive: true })
    const seed: Array<[string, string]> = [
      ['book.md', `# ${title}\n`],
      ['style.md', STYLE_TEMPLATE],
      ['summary.md', '# Summary\n\n'],
      ['theme.md', '# Theme\n\n'],
      ['tropes.md', '# Tropes and subversions\n\n'],
      ['characters.md', '# Characters\n\n'],
      ['outline.md', '# Outline\n\n'],
      ['bible.md', BIBLE_TEMPLATE]
    ]
    for (const [name, text] of seed) {
      if (!(await exists(path.join(dir, name)))) await fs.writeFile(path.join(dir, name), text)
    }
    return new Book(dir)
  }

  abs(rel: string): string {
    const p = path.resolve(this.root, rel)
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new Error(`Path outside the book: ${rel}`)
    return p
  }

  scenePath(sceneId: string, file: SceneFile): string {
    return this.abs(sceneId + (file === 'notes' ? NOTES_EXT : '.md'))
  }

  docPath(ref: DocRef): string {
    if (ref.kind === 'scene') return this.scenePath(ref.sceneId, ref.file)
    if (ref.kind === 'chapter') return this.abs(`${ref.chapterId}/chapter.md`)
    return this.abs(ref.name)
  }

  sidecarPath(ref: DocRef): string {
    if (ref.kind === 'scene') return this.abs(path.join(META, 'scenes', path.relative(MANUSCRIPT, ref.sceneId) + '.json'))
    if (ref.kind === 'chapter') return this.abs(path.join(META, 'docs', 'chapters', path.relative(MANUSCRIPT, ref.chapterId) + '.json'))
    return this.abs(path.join(META, 'docs', ref.name + '.json'))
  }

  async title(): Promise<string> {
    return firstHeading(await readOrNull(this.abs('book.md'))) ?? path.basename(this.root)
  }

  async scenes(): Promise<SceneText[]> {
    const out: SceneText[] = []
    for (const c of await this.chapterDirs()) {
      for (const stem of await this.sceneStems(c)) {
        const id = `${c}/${stem}`
        const prose = await readOrNull(this.scenePath(id, 'prose'))
        const notes = await readOrNull(this.scenePath(id, 'notes'))
        out.push({ id, chapterId: c, title: firstHeading(prose) ?? firstHeading(notes) ?? humanize(stem), prose, notes })
      }
    }
    return out
  }

  private async chapterDirs(): Promise<string[]> {
    return (await listDir(this.abs(MANUSCRIPT)))
      .filter((d) => d.isDirectory())
      .map((d) => `${MANUSCRIPT}/${d.name}`)
      .sort()
  }

  private async sceneStems(chapterId: string): Promise<string[]> {
    const files = (await listDir(this.abs(chapterId))).filter((f) => f.isFile()).map((f) => f.name)
    const stems = new Set<string>()
    for (const f of files) {
      if (f === 'chapter.md') continue
      if (f.endsWith(NOTES_EXT)) stems.add(f.slice(0, -NOTES_EXT.length))
      else if (f.endsWith('.md')) stems.add(f.slice(0, -3))
    }
    return [...stems].sort()
  }

  async tree(): Promise<BookTree> {
    const chapters: ChapterRef[] = []
    const scenes = await this.scenes()
    for (const dir of await this.chapterDirs()) {
      const chapterMd = await readOrNull(this.abs(`${dir}/chapter.md`))
      const refs: SceneRef[] = []
      for (const s of scenes.filter((x) => x.chapterId === dir)) {
        const sidecar = await this.readSidecar({ kind: 'scene', sceneId: s.id, file: 'prose' })
        const live = s.prose === null ? [] : healMarks(s.prose, sidecar.marks.filter((m) => m.file === 'prose')).marks
        const body = s.prose ? stripHeading(s.prose) : ''
        refs.push({
          id: s.id,
          chapterId: dir,
          title: s.title,
          hasProse: body.trim().length > 0,
          hasNotes: s.notes !== null && stripHeading(s.notes).trim().length > 0,
          toReview: live.filter((m) => m.kind === 'unreviewed' || m.kind === 'updated').length,
          conflicts: live.filter((m) => m.kind === 'conflict').length,
          words: countWords(body)
        })
      }
      const base = dir.slice(MANUSCRIPT.length + 1)
      chapters.push({ id: dir, number: parseInt(base, 10) || chapters.length + 1, title: firstHeading(chapterMd) ?? humanize(base), scenes: refs })
    }
    return { root: this.root, title: await this.title(), chapters, openAlerts: 0, divergedOutline: 0 }
  }

  async createChapter(title: string): Promise<string> {
    const tree = await this.tree()
    const n = Math.max(0, ...tree.chapters.map((c) => c.number)) + 1
    const id = `${MANUSCRIPT}/${pad(n)}-${slugify(title)}`
    await fs.mkdir(this.abs(id), { recursive: true })
    await fs.writeFile(this.abs(`${id}/chapter.md`), `# ${title}\n\n`)
    return id
  }

  async createScene(chapterId: string, title: string, notes?: string, prose?: string): Promise<string> {
    const stems = await this.sceneStems(chapterId)
    const n = Math.max(0, ...stems.map((s) => parseInt(s, 10) || 0)) + 1
    let id = `${chapterId}/${pad(n)}-${slugify(title)}`
    for (let i = 2; await exists(this.scenePath(id, 'notes')); i++) id = `${chapterId}/${pad(n)}-${slugify(title)}-${i}`
    // A new scene starts as notes only: a scene not drafted yet.
    await atomicWrite(this.scenePath(id, 'notes'), notes ?? `# ${title}\n\n`)
    if (prose !== undefined) await atomicWrite(this.scenePath(id, 'prose'), prose)
    return id
  }

  /** Rename by rewriting the title heading; the file name stays, so links and history hold. */
  async renameScene(sceneId: string, title: string): Promise<void> {
    for (const file of ['prose', 'notes'] as const) {
      const p = this.scenePath(sceneId, file)
      const text = await readOrNull(p)
      if (text === null) continue
      const next = /^#\s+.*$/m.test(text) ? text.replace(/^#\s+.*$/m, `# ${title}`) : `# ${title}\n\n${text}`
      await atomicWrite(p, next)
    }
  }

  async readDoc(ref: DocRef): Promise<DocContent> {
    const text = await readOrNull(this.docPath(ref))
    const stored = await this.readSidecar(ref)
    const file: SceneFile = ref.kind === 'scene' ? ref.file : 'prose'
    // Heal against whatever is on disk now; edits made outside the app count.
    const marks = healMarks(text ?? '', stored.marks.filter((m) => m.file === file)).marks
    return { text, marks }
  }

  async writeDoc(ref: DocRef, text: string): Promise<void> {
    await atomicWrite(this.docPath(ref), text)
  }

  async readSidecar(ref: DocRef): Promise<Sidecar> {
    const raw = await readOrNull(this.sidecarPath(ref))
    if (!raw) return emptySidecar()
    try {
      const parsed = JSON.parse(raw) as Sidecar
      return parsed && Array.isArray(parsed.marks) ? parsed : emptySidecar()
    } catch {
      // A broken sidecar loses review state, never words.
      return emptySidecar()
    }
  }

  /** Replace the marks of one document; a scene's other file keeps its marks. */
  async writeDocMarks(ref: DocRef, marks: MarkRecord[]): Promise<void> {
    const file: SceneFile = ref.kind === 'scene' ? ref.file : 'prose'
    const cur = await this.readSidecar(ref)
    const next: Sidecar = { version: 1, marks: [...cur.marks.filter((m) => m.file !== file), ...marks.map((m) => ({ ...m, file }))] }
    const p = this.sidecarPath(ref)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await atomicWrite(p, JSON.stringify(next, null, 2) + '\n')
  }

  async addDocMarks(ref: DocRef, marks: MarkRecord[]): Promise<void> {
    const cur = await this.readDoc(ref)
    await this.writeDocMarks(ref, [...cur.marks, ...marks])
  }

  async readText(rel: string): Promise<string | null> {
    return readOrNull(this.abs(rel))
  }

  async readPage(name: PageName): Promise<string> {
    return (await readOrNull(this.abs(name))) ?? ''
  }

  /** Map an absolute file path back to the document it is. */
  refForPath(abs: string): DocRef | null {
    const rel = path.relative(this.root, abs).split(path.sep).join('/')
    if (!rel.includes('/') && rel.endsWith('.md')) return { kind: 'page', name: rel as PageName }
    if (!rel.startsWith(MANUSCRIPT + '/')) return null
    if (rel.endsWith('/chapter.md')) return { kind: 'chapter', chapterId: rel.slice(0, -'/chapter.md'.length) }
    if (rel.endsWith(NOTES_EXT)) return { kind: 'scene', sceneId: rel.slice(0, -NOTES_EXT.length), file: 'notes' }
    if (rel.endsWith('.md')) return { kind: 'scene', sceneId: rel.slice(0, -3), file: 'prose' }
    return null
  }

  /** Store for app data under .cyberkitty/. */
  async readJson<T>(name: string, fallback: T): Promise<T> {
    const raw = await readOrNull(this.abs(path.join(META, name)))
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await atomicWrite(this.abs(path.join(META, name)), JSON.stringify(value, null, 2) + '\n')
  }
}

export const STYLE_TEMPLATE = `# Style

## Samples

Paste a few thousand words of your own prose here. A finished short story is a good start. Claude matches these more closely than anything you write about them.

## Description

How your prose works: rhythm, diction, point of view and tense, dialogue, imagery, and what you never do.

## Ban list

- something shifted
- a breath she didn't know she was holding
- the weight of
- testament to
- couldn't help but
`

export const BIBLE_TEMPLATE = `# Planned

Facts you have decided before any scene says them. One bullet each; start with who or what it is about.

-
`

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}’']+/gu) ?? []).length
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function stripHeading(md: string): string {
  return md.replace(/^\s*#\s+[^\n]*\n?/, '')
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return null
  }
}

async function listDir(p: string): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(p, { withFileTypes: true })
  } catch {
    return []
  }
}

let tmpSeq = 0
export async function atomicWrite(p: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.${tmpSeq++}.tmp`
  await fs.writeFile(tmp, text)
  await fs.rename(tmp, p)
}
