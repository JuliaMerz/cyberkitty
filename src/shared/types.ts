// Types shared by the main process, the preload bridge and the UI.

/** The marks Claude's contributions wear. One name, one meaning, on every page. */
export type MarkKind = 'unreviewed' | 'updated' | 'suggested' | 'conflict'

/** The order the key lists marks in, on every page. */
export const MARK_ORDER: MarkKind[] = ['unreviewed', 'updated', 'suggested', 'conflict']

export const MARK_HELP: Record<MarkKind, string> = {
  unreviewed: 'Claude’s, in the file, not accepted yet',
  updated: 'changed since you accepted it',
  suggested: 'Claude’s, not in the file yet',
  conflict: 'disagrees with something elsewhere'
}

export type SceneFile = 'prose' | 'notes'

/**
 * A mark as stored in a scene's sidecar. It holds no offsets that the Markdown
 * depends on: it finds its way back to the text through the quoted words and a
 * little context either side (see anchors.ts).
 */
export interface MarkRecord {
  id: string
  kind: MarkKind
  file: SceneFile
  anchor: Anchor
  /** Where the mark came from, shown in the hover tooltip. */
  origin: { source: 'draft' | 'chat' | 'scan' | 'rewrite'; note?: string; at: string }
  /** For `updated`: the text the author last accepted. */
  acceptedText?: string
  /** For `suggested`: the replacement text that is not in the file yet. */
  replacement?: string
}

export interface Anchor {
  /** The exact words the mark covers. */
  quote: string
  /** Up to 40 characters before the quote, used to choose between repeats. */
  prefix: string
  /** Up to 40 characters after the quote. */
  suffix: string
  /** Where the quote started last time; only a hint. */
  offset: number
}

export interface SceneSidecar {
  version: 1
  marks: MarkRecord[]
}

export interface SceneRef {
  /** Path relative to the book folder, without extension, e.g. manuscript/01-the-harbor/01-arrival */
  id: string
  chapterId: string
  title: string
  hasProse: boolean
  hasNotes: boolean
  toReview: number
}

export interface ChapterRef {
  id: string
  number: number
  title: string
  scenes: SceneRef[]
}

export interface BookTree {
  root: string
  title: string
  chapters: ChapterRef[]
}

export interface SceneContent {
  id: string
  title: string
  prose: string | null
  notes: string | null
  sidecar: SceneSidecar
}

export type PageName = 'style.md' | 'book.md'

export type Lane = 'planner' | 'writer' | 'writerQuick' | 'quick' | 'background'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface LaneSetting {
  model: string
  effort: Effort
}

export interface Settings {
  lanes: Record<Lane, LaneSetting>
  dailyCapUsd: number
  lastBook: string | null
  sceneView: 'notes' | 'both' | 'prose'
  /** Seconds without typing before work counts as settled (snapshot, later: settling). */
  settleSeconds: number
}

export interface SpendSummary {
  todayUsd: number
  capUsd: number
}

export interface DraftRequest {
  sceneId: string
  /** Notes to draft from. Empty means the whole notes file. */
  beats?: string
  /** The prose before the insertion point, so the draft continues it. */
  proseBefore: string
  /** The prose after the insertion point, if drafting into the middle. */
  proseAfter: string
}

export interface DraftResult {
  ok: boolean
  model?: string
  costUsd?: number
  /** Set when a safety classifier declined. */
  refused?: boolean
  error?: string
  /** Pinned lines from the notes that the draft did not use verbatim. */
  missingPinned?: string[]
}

export interface FileChangedEvent {
  sceneId: string
  file: SceneFile
  text: string | null
}

/** The bridge the preload script exposes as window.ck. */
export interface CkApi {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  hasApiKey(): Promise<boolean>
  setApiKey(key: string): Promise<void>
  getSpend(): Promise<SpendSummary>

  openBookDialog(): Promise<BookTree | null>
  createBookDialog(): Promise<BookTree | null>
  openSampleBook(): Promise<BookTree | null>
  openBook(path: string): Promise<BookTree | null>
  getBook(): Promise<BookTree | null>
  createChapter(title: string): Promise<BookTree>
  createScene(chapterId: string, title: string): Promise<{ tree: BookTree; sceneId: string }>

  readScene(sceneId: string): Promise<SceneContent>
  writeSceneFile(sceneId: string, file: SceneFile, text: string): Promise<void>
  writeSidecar(sceneId: string, sidecar: SceneSidecar): Promise<void>
  noteActivity(): void
  /** Book-level pages such as style.md. */
  readPage(name: PageName): Promise<string>
  writePage(name: PageName, text: string): Promise<void>

  draft(req: DraftRequest): Promise<string>
  cancelDraft(jobId: string): void
  onDraftDelta(cb: (jobId: string, text: string) => void): () => void
  onDraftDone(cb: (jobId: string, result: DraftResult) => void): () => void
  onFileChanged(cb: (e: FileChangedEvent) => void): () => void
  onBookChanged(cb: (tree: BookTree) => void): () => void
  onSpend(cb: (s: SpendSummary) => void): () => void
}
