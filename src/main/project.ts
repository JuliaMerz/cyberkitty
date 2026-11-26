// The book on disk: one folder of Markdown files. Markdown is the source of
// truth for every word; everything CyberKitty adds lives under .cyberkitty/.
//
//   book.md                                   # Title, and anything else
//   style.md                                  the style page
//   manuscript/01-the-harbor/chapter.md       # The Harbor
//   manuscript/01-the-harbor/01-arrival.md        prose only
//   manuscript/01-the-harbor/01-arrival.notes.md  the scratchpad
//   .cyberkitty/scenes/01-the-harbor/01-arrival.json   sidecar (marks, links)
//   .cyberkitty/history.git                   hidden snapshots

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { healMarks } from '@shared/anchors'
import { firstHeading, humanize, slugify } from '@shared/notes'
import type { BookTree, ChapterRef, SceneContent, SceneFile, SceneRef, SceneSidecar } from '@shared/types'

export const MANUSCRIPT = 'manuscript'
export const META = '.cyberkitty'

const NOTES_EXT = '.notes.md'

export function emptySidecar(): SceneSidecar {
  return { version: 1, marks: [] }
}

export class Book {
  constructor(public readonly root: string) {}

  static async isBook(dir: string): Promise<boolean> {
    return exists(path.join(dir, MANUSCRIPT))
  }

  /** Create a new, empty book in an existing folder. */
  static async create(dir: string, title: string): Promise<Book> {
    await fs.mkdir(path.join(dir, MANUSCRIPT), { recursive: true })
    if (!(await exists(path.join(dir, 'book.md')))) {
      await fs.writeFile(path.join(dir, 'book.md'), `# ${title}\n`)
    }
    if (!(await exists(path.join(dir, 'style.md')))) {
      await fs.writeFile(path.join(dir, 'style.md'), STYLE_TEMPLATE)
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

  sidecarPath(sceneId: string): string {
    const rel = path.relative(MANUSCRIPT, sceneId)
    return this.abs(path.join(META, 'scenes', rel + '.json'))
  }

  async title(): Promise<string> {
    return firstHeading(await readOrNull(this.abs('book.md'))) ?? path.basename(this.root)
  }

  async tree(): Promise<BookTree> {
    const chapters: ChapterRef[] = []
    const dirs = (await listDir(this.abs(MANUSCRIPT))).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    for (const dir of dirs) {
      const chapterId = `${MANUSCRIPT}/${dir}`
      const chapterMd = await readOrNull(this.abs(`${chapterId}/chapter.md`))
      const files = (await listDir(this.abs(chapterId))).filter((f) => f.isFile()).map((f) => f.name)
      const stems = new Set<string>()
      for (const f of files) {
        if (f === 'chapter.md') continue
        if (f.endsWith(NOTES_EXT)) stems.add(f.slice(0, -NOTES_EXT.length))
        else if (f.endsWith('.md')) stems.add(f.slice(0, -3))
      }
      const scenes: SceneRef[] = []
      for (const stem of [...stems].sort()) {
        const id = `${chapterId}/${stem}`
        const prose = await readOrNull(this.scenePath(id, 'prose'))
        const notes = await readOrNull(this.scenePath(id, 'notes'))
        const sidecar = await this.readSidecar(id)
        const toReview = prose === null ? 0 : healMarks(prose, sidecar.marks.filter((m) => m.file === 'prose' && (m.kind === 'unreviewed' || m.kind === 'updated'))).marks.length
        scenes.push({
          id,
          chapterId,
          title: firstHeading(prose) ?? firstHeading(notes) ?? humanize(stem),
          hasProse: prose !== null && stripHeading(prose).trim().length > 0,
          hasNotes: notes !== null && stripHeading(notes).trim().length > 0,
          toReview
        })
      }
      chapters.push({
        id: chapterId,
        number: parseInt(dir, 10) || chapters.length + 1,
        title: firstHeading(chapterMd) ?? humanize(dir),
        scenes
      })
    }
    return { root: this.root, title: await this.title(), chapters }
  }

  async createChapter(title: string): Promise<string> {
    const tree = await this.tree()
    const n = Math.max(0, ...tree.chapters.map((c) => c.number)) + 1
    const id = `${MANUSCRIPT}/${pad(n)}-${slugify(title)}`
    await fs.mkdir(this.abs(id), { recursive: true })
    await fs.writeFile(this.abs(`${id}/chapter.md`), `# ${title}\n`)
    return id
  }

  async createScene(chapterId: string, title: string): Promise<string> {
    const tree = await this.tree()
    const chapter = tree.chapters.find((c) => c.id === chapterId)
    if (!chapter) throw new Error(`No chapter ${chapterId}`)
    const n = chapter.scenes.length + 1
    let id = `${chapterId}/${pad(n)}-${slugify(title)}`
    for (let i = 2; await exists(this.scenePath(id, 'notes')); i++) id = `${chapterId}/${pad(n)}-${slugify(title)}-${i}`
    // A new scene starts as notes only: a scene not drafted yet.
    await fs.writeFile(this.scenePath(id, 'notes'), `# ${title}\n\n`)
    return id
  }

  async readScene(sceneId: string): Promise<SceneContent> {
    const prose = await readOrNull(this.scenePath(sceneId, 'prose'))
    const notes = await readOrNull(this.scenePath(sceneId, 'notes'))
    const stored = await this.readSidecar(sceneId)
    // Heal against whatever is on disk now; edits made outside the app count.
    const marks = [
      ...healMarks(prose ?? '', stored.marks.filter((m) => m.file === 'prose')).marks,
      ...healMarks(notes ?? '', stored.marks.filter((m) => m.file === 'notes')).marks
    ]
    const stem = sceneId.split('/').pop() ?? sceneId
    return {
      id: sceneId,
      title: firstHeading(prose) ?? firstHeading(notes) ?? humanize(stem),
      prose,
      notes,
      sidecar: { version: 1, marks }
    }
  }

  async writeSceneFile(sceneId: string, file: SceneFile, text: string): Promise<void> {
    await atomicWrite(this.scenePath(sceneId, file), text)
  }

  async readSidecar(sceneId: string): Promise<SceneSidecar> {
    const raw = await readOrNull(this.sidecarPath(sceneId))
    if (!raw) return emptySidecar()
    try {
      const parsed = JSON.parse(raw) as SceneSidecar
      return parsed && Array.isArray(parsed.marks) ? parsed : emptySidecar()
    } catch {
      // A broken sidecar loses review state, never words.
      return emptySidecar()
    }
  }

  async writeSidecar(sceneId: string, sidecar: SceneSidecar): Promise<void> {
    const p = this.sidecarPath(sceneId)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await atomicWrite(p, JSON.stringify(sidecar, null, 2) + '\n')
  }

  async readText(rel: string): Promise<string | null> {
    return readOrNull(this.abs(rel))
  }

  /** Map an absolute file path back to a scene id and which file it is. */
  sceneForPath(abs: string): { sceneId: string; file: SceneFile } | null {
    const rel = path.relative(this.root, abs).split(path.sep).join('/')
    if (!rel.startsWith(MANUSCRIPT + '/') || rel.endsWith('/chapter.md')) return null
    if (rel.endsWith(NOTES_EXT)) return { sceneId: rel.slice(0, -NOTES_EXT.length), file: 'notes' }
    if (rel.endsWith('.md')) return { sceneId: rel.slice(0, -3), file: 'prose' }
    return null
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
`

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function stripHeading(md: string): string {
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

async function atomicWrite(p: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  await fs.writeFile(tmp, text)
  await fs.rename(tmp, p)
}
