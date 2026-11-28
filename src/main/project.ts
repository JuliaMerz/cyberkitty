// The book on disk: one folder of Markdown files. Markdown is the source of
// truth for every word; everything CyberKitty adds lives under .cyberkitty/.
//
//   book.md, summary.md, theme.md, tropes.md, characters.md, outline.md
//   style.md                                  the style page
//   bible.md                                  planned bible entries, by hand
//   bible/characters.md, events.md, …        the story bible as Markdown (see shared/biblemd.ts)
//   manuscript/01-the-harbor/chapter.md       # The Harbor, then the chapter's intent
//   manuscript/01-the-harbor/01-arrival.md        prose only
//   manuscript/01-the-harbor/01-arrival.notes.md  the scratchpad
//   manuscript/01-the-harbor/01n-a-thought.note.md a note woven in after that scene (see shared/order.ts)
//   manuscript/01n-between.note.md            a note between chapters 1 and 2
//   notes/**/*.md                             the Notes section: the author's scratch notes, folders as groups
//   .cyberkitty/scenes/01-the-harbor/01-arrival.json   sidecar for both scene files
//   .cyberkitty/docs/<page>.json              sidecars for pages and chapters
//   .cyberkitty/docs/notes/<note path>.json   sidecars for notes
//   .cyberkitty/*.json                        chat, bible sidecar, summaries, alerts, changes
//   .cyberkitty/history.git                   hidden snapshots

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { healMarks } from '@shared/anchors'
import { firstHeading, humanize, slugify } from '@shared/notes'
import { byName, keyBetween } from '@shared/order'
import { STYLE_TEMPLATE } from '@shared/style'
import { NOTE_EXT, NOTES_DIR, type BookTree, type ChapterRef, type DocContent, type DocRef, type MarkRecord, type NotePlace, type NoteRef, type PageName, type SceneFile, type SceneRef, type Sidecar } from '@shared/types'

export const MANUSCRIPT = 'manuscript'
export const META = '.cyberkitty'

const NOTES_EXT = '.notes.md'

/** Called after any document's marks are written. */
export const markListeners = new Set<(book: Book, ref: DocRef, marks: MarkRecord[]) => void>()

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

export interface NoteText {
  id: string
  title: string
  /** notes, notes/<folder>, manuscript, or a chapter id. */
  folder: string
  text: string
}

/** Whether an id names a note: a Markdown file under notes/, or a .note.md file among the chapters or in a chapter. */
export function isNoteId(id: string): boolean {
  const parts = id.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) || !id.endsWith('.md')) return false
  if (parts[0] === NOTES_DIR) return parts.length >= 2
  return parts[0] === MANUSCRIPT && id.endsWith(NOTE_EXT) && (parts.length === 2 || parts.length === 3)
}

/** The folder a note is in. */
export function noteFolder(id: string): string {
  return id.split('/').slice(0, -1).join('/')
}

/** A note's file name without its order key and extension: "02n-the-shed.note.md" is "the-shed". */
function noteSlug(id: string): string {
  const name = id.split('/').pop() ?? id
  return name.replace(NOTE_EXT, '').replace(/\.md$/, '').replace(/^\d+[a-z]*-/, '') || 'note'
}

function noteTitle(id: string, text: string | null): string {
  const s = noteSlug(id).replace(/-/g, ' ')
  return firstHeading(text) ?? s.charAt(0).toUpperCase() + s.slice(1)
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
    if (ref.kind === 'note') {
      if (!isNoteId(ref.id)) throw new Error(`Not a note: ${ref.id}`)
      return this.abs(ref.id)
    }
    if (ref.kind === 'scene') return this.scenePath(ref.sceneId, ref.file)
    if (ref.kind === 'chapter') return this.abs(`${ref.chapterId}/chapter.md`)
    return this.abs(ref.name)
  }

  sidecarPath(ref: DocRef): string {
    if (ref.kind === 'note') return this.abs(path.join(META, 'docs', 'notes', ref.id.replace(/\.md$/, '') + '.json'))
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
      if (f === 'chapter.md' || f.endsWith(NOTE_EXT)) continue
      if (f.endsWith(NOTES_EXT)) stems.add(f.slice(0, -NOTES_EXT.length))
      else if (f.endsWith('.md')) stems.add(f.slice(0, -3))
    }
    return [...stems].sort()
  }

  /** Every note: the Notes section first, then the woven ones in manuscript order. */
  async notes(): Promise<NoteText[]> {
    const ids: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = (await listDir(this.abs(dir))).filter((e) => !e.name.startsWith('.')).sort((a, b) => byName(a.name, b.name))
      for (const e of entries) if (e.isFile() && e.name.endsWith('.md')) ids.push(`${dir}/${e.name}`)
      for (const e of entries) if (e.isDirectory()) await walk(`${dir}/${e.name}`)
    }
    await walk(NOTES_DIR)
    for (const dir of [MANUSCRIPT, ...(await this.chapterDirs())]) {
      for (const e of await listDir(this.abs(dir))) if (e.isFile() && e.name.endsWith(NOTE_EXT)) ids.push(`${dir}/${e.name}`)
    }
    const out: NoteText[] = []
    for (const id of ids) {
      const text = (await readOrNull(this.abs(id))) ?? ''
      out.push({ id, title: noteTitle(id, text), folder: noteFolder(id), text })
    }
    return out
  }

  async readNote(id: string): Promise<NoteText | null> {
    if (!isNoteId(id)) return null
    const text = await readOrNull(this.abs(id))
    return text === null ? null : { id, title: noteTitle(id, text), folder: noteFolder(id), text }
  }

  /** What sits in a manuscript folder, in reading order: chapters or scenes, and notes, by name. */
  private async orderIn(folder: string, notes?: NoteText[]): Promise<Array<{ id: string; name: string }>> {
    const all = notes ?? (await this.notes())
    const items =
      folder === MANUSCRIPT
        ? (await this.chapterDirs()).map((id) => ({ id, name: id.slice(MANUSCRIPT.length + 1) }))
        : (await this.sceneStems(folder)).map((stem) => ({ id: `${folder}/${stem}`, name: stem }))
    for (const n of all) if (n.folder === folder) items.push({ id: n.id, name: n.id.slice(folder.length + 1, -NOTE_EXT.length) })
    return items.sort((a, b) => byName(a.name, b.name))
  }

  async tree(): Promise<BookTree> {
    const chapters: ChapterRef[] = []
    const scenes = await this.scenes()
    const notes = await this.notes()
    const noteRef = (n: NoteText): NoteRef => ({ id: n.id, title: n.title, folder: n.folder, words: countWords(stripHeading(n.text)) })
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
      chapters.push({
        id: dir,
        number: parseInt(base, 10) || chapters.length + 1,
        title: firstHeading(chapterMd) ?? humanize(base),
        scenes: refs,
        notes: notes.filter((n) => n.folder === dir).map(noteRef),
        order: (await this.orderIn(dir, notes)).map((x) => x.id)
      })
    }
    return {
      root: this.root,
      title: await this.title(),
      chapters,
      notes: notes.filter((n) => n.folder === NOTES_DIR || n.folder.startsWith(`${NOTES_DIR}/`)).map(noteRef),
      manuscriptNotes: notes.filter((n) => n.folder === MANUSCRIPT).map(noteRef),
      order: (await this.orderIn(MANUSCRIPT, notes)).map((x) => x.id),
      openAlerts: 0,
      divergedOutline: 0
    }
  }

  /** The id a note would have at a place: a slug under notes/, or a name that sorts into its spot in the manuscript. */
  private async noteIdAt(place: NotePlace, slug: string, self?: string): Promise<string> {
    let folder: string
    let name: (n: number) => string
    if (place.where === 'notes') {
      folder = place.folder && (place.folder === NOTES_DIR || place.folder.startsWith(`${NOTES_DIR}/`)) ? place.folder : NOTES_DIR
      name = (i) => `${slug}${i > 1 ? `-${i}` : ''}.md`
    } else {
      folder = place.chapterId ?? MANUSCRIPT
      if (folder !== MANUSCRIPT && !(await this.chapterDirs()).includes(folder)) throw new Error(`No such chapter: ${folder}`)
      const items = (await this.orderIn(folder)).filter((x) => x.id !== self)
      const at = place.after === null ? -1 : items.findIndex((x) => x.id === place.after)
      const i = at === -1 && place.after !== null ? items.length - 1 : at
      const key = keyBetween(items[i]?.name ?? null, items[i + 1]?.name ?? null)
      name = (n) => `${key}-${slug}${n > 1 ? `-${n}` : ''}${NOTE_EXT}`
    }
    for (let i = 1; ; i++) {
      const id = `${folder}/${name(i)}`
      if (id === self || !(await exists(this.abs(id)))) return id
    }
  }

  async createNote(title: string, place: NotePlace, body = ''): Promise<string> {
    const id = await this.noteIdAt(place, slugify(title))
    await atomicWrite(this.abs(id), `# ${title}\n\n${body}`)
    return id
  }

  /** Move a note between the Notes section and the manuscript, or to another spot. Its marks go with it. */
  async moveNote(id: string, place: NotePlace): Promise<string> {
    if (!isNoteId(id) || !(await exists(this.abs(id)))) throw new Error(`No such note: ${id}`)
    const to = await this.noteIdAt(place, noteSlug(id), id)
    if (to === id) return id
    await this.renameDoc({ kind: 'note', id }, { kind: 'note', id: to })
    return to
  }

  /** A note in a chapter becomes the notes file of a new scene, in the same place. */
  async noteToScene(id: string): Promise<string> {
    const folder = noteFolder(id)
    if (!isNoteId(id) || !id.endsWith(NOTE_EXT) || !folder.startsWith(`${MANUSCRIPT}/`)) throw new Error('Only a note inside a chapter can become a scene. Move it into a chapter first.')
    const sceneId = id.slice(0, -NOTE_EXT.length)
    if ((await exists(this.scenePath(sceneId, 'notes'))) || (await exists(this.scenePath(sceneId, 'prose')))) throw new Error('A scene with that name already exists.')
    await this.renameDoc({ kind: 'note', id }, { kind: 'scene', sceneId, file: 'notes' })
    return sceneId
  }

  /** A scene with no prose yet becomes a note in its place. */
  async sceneToNote(sceneId: string): Promise<string> {
    const prose = await readOrNull(this.scenePath(sceneId, 'prose'))
    if (prose !== null && stripHeading(prose).trim()) throw new Error('This scene has prose. Only a scene with no prose yet can become a note.')
    const id = `${sceneId}${NOTE_EXT}`
    if (await exists(this.abs(id))) throw new Error('A note with that name already exists.')
    const notesFile = this.scenePath(sceneId, 'notes')
    if (await exists(notesFile)) await this.renameDoc({ kind: 'scene', sceneId, file: 'notes' }, { kind: 'note', id })
    else await atomicWrite(this.abs(id), `# ${firstHeading(prose) ?? humanize(sceneId.split('/').pop() ?? '')}\n\n`)
    if (prose !== null) await fs.rm(this.scenePath(sceneId, 'prose'), { force: true })
    await fs.rm(this.sidecarPath({ kind: 'scene', sceneId, file: 'notes' }), { force: true })
    return id
  }

  /** Rename a document's file and carry its marks to the new place. */
  private async renameDoc(from: DocRef, to: DocRef): Promise<void> {
    const src = this.docPath(from)
    const dst = this.docPath(to)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.rename(src, dst)
    // Written straight to the sidecar: the marks are not new, so listeners need not hear of them.
    const marks = (await this.readSidecar(from)).marks.filter((m) => m.file === (from.kind === 'scene' ? from.file : 'prose'))
    if (marks.length) {
      const file: SceneFile = to.kind === 'scene' ? to.file : 'prose'
      const cur = await this.readSidecar(to)
      const p = this.sidecarPath(to)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await atomicWrite(p, JSON.stringify({ version: 1, marks: [...cur.marks.filter((m) => m.file !== file), ...marks.map((m) => ({ ...m, file }))] }, null, 2) + '\n')
    }
    if (from.kind === 'scene') {
      const cur = await this.readSidecar(from)
      const rest = cur.marks.filter((m) => m.file !== from.file)
      if (rest.length) await atomicWrite(this.sidecarPath(from), JSON.stringify({ version: 1, marks: rest }, null, 2) + '\n')
      else await fs.rm(this.sidecarPath(from), { force: true })
    } else await fs.rm(this.sidecarPath(from), { force: true })
  }

  async createChapter(title: string): Promise<string> {
    // After everything in the manuscript, notes between chapters included.
    const n = Math.max(0, ...(await this.orderIn(MANUSCRIPT)).map((x) => parseInt(x.name, 10) || 0)) + 1
    const id = `${MANUSCRIPT}/${pad(n)}-${slugify(title)}`
    await fs.mkdir(this.abs(id), { recursive: true })
    await fs.writeFile(this.abs(`${id}/chapter.md`), `# ${title}\n\n`)
    return id
  }

  async createScene(chapterId: string, title: string, notes?: string, prose?: string): Promise<string> {
    // After everything in the chapter, notes included.
    const n = Math.max(0, ...(await this.orderIn(chapterId)).map((x) => parseInt(x.name, 10) || 0)) + 1
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

  /**
   * Replace the marks of one document; a scene's other file keeps its marks.
   * Every mark write in the app comes through here, from the editor or from
   * the main process, so listeners (the event log) see each mark once it is
   * on disk.
   */
  async writeDocMarks(ref: DocRef, marks: MarkRecord[]): Promise<void> {
    const file: SceneFile = ref.kind === 'scene' ? ref.file : 'prose'
    const cur = await this.readSidecar(ref)
    const next: Sidecar = { version: 1, marks: [...cur.marks.filter((m) => m.file !== file), ...marks.map((m) => ({ ...m, file }))] }
    const p = this.sidecarPath(ref)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await atomicWrite(p, JSON.stringify(next, null, 2) + '\n')
    for (const l of markListeners) l(this, ref, marks)
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
    if (isNoteId(rel)) return { kind: 'note', id: rel }
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
/** Errors Windows gives while another program (OneDrive, an antivirus scanner, another editor) briefly holds a file. */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Write a file whole or not at all: a temp file, then a rename over the real
 * one. On Windows the rename can be refused for a moment while something else
 * has the file open, so it is retried for about two seconds; then the file is
 * written in place, which works whenever the file itself can be written.
 */
export async function atomicWrite(p: string, text: string, waits = [50, 100, 200, 400, 600, 800]): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.${tmpSeq++}.tmp`
  await fs.writeFile(tmp, text)
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, p)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!BUSY.has(code)) {
        await fs.rm(tmp, { force: true }).catch(() => undefined)
        throw err
      }
      if (i >= waits.length) break
      await new Promise((r) => setTimeout(r, waits[i]))
    }
  }
  try {
    await fs.writeFile(p, text)
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}
