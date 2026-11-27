// Types shared by the main process, the preload bridge and the UI.

/** Marks stored in sidecars. One name, one meaning, on every page. */
export type MarkKind = 'unreviewed' | 'updated' | 'suggested' | 'conflict'
/** Marks computed on the fly, shown on the pages where they can occur. */
export type DerivedMarkKind = 'tell' | 'gap'
export type AnyMarkKind = MarkKind | DerivedMarkKind

/** The order the key lists marks in, on every page. */
export const MARK_ORDER: AnyMarkKind[] = ['unreviewed', 'updated', 'suggested', 'conflict', 'tell', 'gap']

export const MARK_HELP: Record<AnyMarkKind, string> = {
  unreviewed: 'Claude’s, in the file, not accepted yet',
  updated: 'changed since you accepted it',
  suggested: 'Claude’s, not in the file yet',
  conflict: 'disagrees with something elsewhere',
  tell: 'a phrase on your ban list',
  gap: 'a [bracketed] spot to draft later'
}

export type SceneFile = 'prose' | 'notes'

/** Book-level Markdown pages, all at the root of the book folder. */
export type PageName =
  | 'book.md'
  | 'summary.md'
  | 'theme.md'
  | 'tropes.md'
  | 'characters.md'
  | 'outline.md'
  | 'style.md'
  | 'bible.md'

export const DIRECTION_PAGES: Array<{ name: PageName; title: string; hint: string }> = [
  { name: 'summary.md', title: 'Summary', hint: 'The premise and where the story is heading, one page at most.' },
  { name: 'theme.md', title: 'Theme', hint: 'What the book is about underneath the plot.' },
  { name: 'tropes.md', title: 'Tropes', hint: 'Each trope the book uses, and whether it is played straight or turned.' },
  { name: 'characters.md', title: 'Characters', hint: 'Who each person is, what they want, how they talk, and their arc.' },
  { name: 'outline.md', title: 'Outline', hint: 'The planned shape of the story, as loose or as tight as you like.' },
  { name: 'style.md', title: 'Style', hint: 'Samples, description and ban list. Goes into every writing prompt.' }
]

/** A Markdown document the app edits: one file of a scene, a chapter's intent, or a book page. */
export type DocRef =
  | { kind: 'scene'; sceneId: string; file: SceneFile }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'page'; name: PageName }

export function docKey(ref: DocRef): string {
  return ref.kind === 'scene' ? `scene:${ref.sceneId}:${ref.file}` : ref.kind === 'chapter' ? `chapter:${ref.chapterId}` : `page:${ref.name}`
}

/**
 * A mark as stored in a sidecar. It holds no offsets that the Markdown depends
 * on: it finds its way back to the text through the quoted words and a little
 * context either side (see anchors.ts).
 */
export interface MarkRecord {
  id: string
  kind: MarkKind
  /** Which file of a scene. Single-file documents use 'prose'. */
  file: SceneFile
  anchor: Anchor
  /** Where the mark came from, shown in the hover tooltip. */
  origin: { source: 'draft' | 'chat' | 'scan' | 'rewrite' | 'change'; note?: string; at: string; chatId?: string }
  /** For `updated`: the text the author last accepted. */
  acceptedText?: string
  /** For `suggested`: the text that is not in the file yet. */
  replacement?: string
  /** For `suggested`: insert the replacement after the anchored text instead of replacing it. */
  insert?: 'after'
  /** For `conflict`: the alert it belongs to. */
  alertId?: string
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

export interface Sidecar {
  version: 1
  marks: MarkRecord[]
}
export type SceneSidecar = Sidecar

export interface SceneRef {
  /** Path relative to the book folder, without extension, e.g. manuscript/01-the-harbor/01-arrival */
  id: string
  chapterId: string
  title: string
  hasProse: boolean
  hasNotes: boolean
  toReview: number
  conflicts: number
  words: number
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
  openAlerts: number
  divergedOutline: number
}

export interface DocContent {
  text: string | null
  marks: MarkRecord[]
}

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
  /** Seconds without typing before work counts as settled. */
  settleSeconds: number
  /** Minutes without typing before a whole-book scan. */
  scanIdleMinutes: number
  /** Prepare sentence alternatives right after a draft, instead of on request. */
  alternativesAhead: boolean
  /** Count a paragraph as reviewed once it has been on screen. */
  reviewWhenSeen: boolean
  /** Next-sentence ghost text while writing fresh prose. Experimental. */
  ghostText: boolean
  /** How much Claude volunteers while blocking: more for newer writers. */
  blockingHelp: 'quiet' | 'some' | 'lots'
}

export interface SpendSummary {
  todayUsd: number
  capUsd: number
  /** Today's prompt tokens by how they were billed, to see that caching works. */
  tokens?: { uncached: number; cacheRead: number; cacheWrite: number }
}

// ---- Drafting -------------------------------------------------------------

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

// ---- Wording tools ----------------------------------------------------------

export type HumanizeTool = 'plainer' | 'shorter' | 'rougher' | 'concrete' | 'sample'

export interface AlternativesRequest {
  sceneId: string
  sentence: string
  paragraph: string
  /** Optional direction, e.g. "more clipped". */
  direction?: string
  acceptedText?: string
}

export interface RewriteRequest {
  ref: DocRef
  quote: string
  context: string
  tool?: HumanizeTool
  instruction?: string
}

export interface ToolResult<T> {
  ok: boolean
  value?: T
  error?: string
}

export interface Correction {
  before: string
  after: string
  at: string
  sceneId?: string
}

// ---- Chat -----------------------------------------------------------------

/** Where the author is when they type. Every chat message carries one. */
export interface Place {
  label: string
  page: 'scene' | 'chapter' | 'page' | 'bible' | 'timeline' | 'alerts' | 'history' | 'settings' | 'change' | 'diagrams' | 'none'
  sceneId?: string
  chapterId?: string
  file?: SceneFile
  pageName?: PageName
  paragraph?: string
  selection?: string
}

/** A passage the author attached to a message, by selecting it or from a hover window. */
export interface PassageRef {
  ref: DocRef
  quote: string
  label: string
}

export interface ChatEntry {
  id: string
  role: 'author' | 'claude' | 'activity'
  text: string
  at: string
  place?: Place
  passages?: PassageRef[]
  /** True while Claude is still writing this entry. */
  streaming?: boolean
  error?: boolean
}

// ---- Story bible -------------------------------------------------------------

export type BibleType = 'character' | 'event' | 'movement' | 'place' | 'world'

export const BIBLE_TYPES: Array<{ type: BibleType; title: string }> = [
  { type: 'character', title: 'Characters' },
  { type: 'event', title: 'Events' },
  { type: 'movement', title: 'Movements' },
  { type: 'place', title: 'Places' },
  { type: 'world', title: 'World rules and objects' }
]

export interface BibleEntry {
  id: string
  type: BibleType
  /** Who or what it is about: a character, a place, an object. */
  subject: string
  text: string
  /** Loose story time, e.g. "day 3, night" or "two days after the fire". */
  storyTime?: string
  /** Relative order of events in story time; lower is earlier. */
  order?: number
  /** For movements: where from and to. */
  from?: string
  to?: string
  source:
    | { kind: 'text'; sceneId: string; quote: string }
    | { kind: 'planned' }
    | { kind: 'idea'; status: 'pending' | 'kept' | 'dismissed'; chatId?: string }
  /** The author corrected this entry; settling leaves the correction alone. */
  corrected?: boolean
  history?: Array<{ text: string; at: string }>
  updatedAt: string
}

export interface SceneSummary {
  sceneId: string
  text: string
  /** Sentences that changed since the author last looked; shaded like prose. */
  changed: string[]
  /** Hash of the prose it was made from, so settling runs only on change. */
  hash: string
  at: string
}

export interface Diagram {
  id: string
  title: string
  kind: 'map' | 'floorplan' | 'family' | 'relationships' | 'other'
  svg: string
  at: string
}

// ---- Alerts ------------------------------------------------------------------

export type AlertKind = 'continuity' | 'timeline' | 'direction' | 'thread' | 'diverged' | 'idea' | 'style-sample' | 'todo' | 'written-before'

export const ALERT_KIND_TITLES: Record<AlertKind, string> = {
  continuity: 'Continuity',
  timeline: 'Timeline',
  direction: 'Direction',
  thread: 'Loose thread',
  diverged: 'Outline diverged',
  idea: 'Bible idea',
  'style-sample': 'Proposed style sample',
  todo: 'Todo',
  'written-before': 'Written before a change'
}

export interface AlertSide {
  ref: DocRef
  quote: string
  label: string
}

export interface Alert {
  id: string
  kind: AlertKind
  title: string
  explanation: string
  sides: AlertSide[]
  /** A suggested fix, in words. */
  fix?: string
  /** Scene the alert is filed under, for grouping in book order. */
  sceneId?: string
  status: 'open' | 'dismissed' | 'done'
  /** Identifies the disagreement, so a dismissal sticks to the exact pair. */
  pairKey: string
  bibleId?: string
  at: string
}

// ---- Chapter-scale changes --------------------------------------------------

export interface ChangeScene {
  sceneId: string
  title: string
  original: string
  rewritten: string | null
  status: 'pending' | 'writing' | 'ready' | 'merged' | 'error'
  error?: string
}

export interface ChangeSpec {
  id: string
  chapterId: string
  title: string
  spec: string
  status: 'draft' | 'rewriting' | 'review' | 'merged' | 'discarded'
  scenes: ChangeScene[]
  createdAt: string
  /** History commit before the merge, for one-step undo. */
  beforeOid?: string
}

export interface HunkDecision {
  sceneId: string
  /** The scene text after the author's per-hunk choices. */
  text: string
  /**
   * Paragraphs that came in through "accept all" and rewrite text the author
   * had: they land as updated, with the version they replace.
   */
  updatedParagraphs: Array<{ text: string; was: string }>
  /** Paragraphs new in the change, taken through "accept all": they land as unreviewed. */
  newParagraphs: string[]
  acceptedParagraphs: string[]
}

// ---- History -------------------------------------------------------------------

export interface RestorePoint {
  oid: string
  message: string
  at: number
}

// ---- Events -----------------------------------------------------------------------

export interface FileChangedEvent {
  key: string
  text: string | null
}

export interface MarksAddedEvent {
  key: string
  records: MarkRecord[]
}

export interface MarksRemovedEvent {
  key: string
  alertId: string
}

export interface JobStatus {
  id: string
  label: string
  state: 'running' | 'done' | 'error'
  detail?: string
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
  importMarkdownDialog(chapterId: string): Promise<BookTree | null>
  openBook(path: string): Promise<BookTree | null>
  closeBook(): Promise<void>
  getBook(): Promise<BookTree | null>
  createChapter(title: string): Promise<BookTree>
  createScene(chapterId: string, title: string): Promise<{ tree: BookTree; sceneId: string }>
  renameScene(sceneId: string, title: string): Promise<BookTree>

  readDoc(ref: DocRef): Promise<DocContent>
  writeDoc(ref: DocRef, text: string): Promise<void>
  writeDocMarks(ref: DocRef, marks: MarkRecord[]): Promise<void>
  setOpenDocs(keys: string[]): void
  noteActivity(place: Place): void
  logCorrection(c: Correction): void

  draft(req: DraftRequest): Promise<string>
  cancelDraft(jobId: string): void
  alternatives(req: AlternativesRequest): Promise<ToolResult<string[]>>
  rewrite(req: RewriteRequest): Promise<ToolResult<string>>
  ghostText(req: { sceneId: string; before: string }): Promise<ToolResult<string>>

  getChat(): Promise<ChatEntry[]>
  sendChat(text: string, place: Place, passages: PassageRef[]): Promise<void>
  stopChat(): void

  getBible(): Promise<BibleEntry[]>
  saveBibleEntry(entry: BibleEntry): Promise<void>
  deleteBibleEntry(id: string): Promise<void>
  getSummaries(): Promise<Record<string, SceneSummary>>
  markSummarySeen(sceneId: string): Promise<void>
  settleNow(): Promise<void>
  getDiagrams(): Promise<Diagram[]>
  drawDiagram(request: string): Promise<ToolResult<Diagram>>
  deleteDiagram(id: string): Promise<void>

  getAlerts(): Promise<Alert[]>
  setAlertStatus(id: string, status: Alert['status']): Promise<void>
  addTodo(text: string, sceneId?: string): Promise<void>
  scanNow(): Promise<void>

  getChanges(): Promise<ChangeSpec[]>
  proposeChange(chapterId: string, request: string): Promise<ToolResult<ChangeSpec>>
  saveChange(change: ChangeSpec): Promise<void>
  runChange(id: string): Promise<void>
  mergeChange(id: string, decisions: HunkDecision[]): Promise<void>
  undoChange(id: string): Promise<void>

  getHistory(): Promise<RestorePoint[]>
  restore(oid: string): Promise<void>

  onDraftDelta(cb: (jobId: string, text: string) => void): () => void
  onDraftDone(cb: (jobId: string, result: DraftResult) => void): () => void
  onFileChanged(cb: (e: FileChangedEvent) => void): () => void
  onMarksAdded(cb: (e: MarksAddedEvent) => void): () => void
  onMarksRemoved(cb: (e: MarksRemovedEvent) => void): () => void
  onBookChanged(cb: (tree: BookTree) => void): () => void
  onSpend(cb: (s: SpendSummary) => void): () => void
  onChat(cb: (entries: ChatEntry[]) => void): () => void
  onDataChanged(cb: (what: 'bible' | 'summaries' | 'alerts' | 'changes' | 'diagrams' | 'history') => void): () => void
  onJob(cb: (job: JobStatus) => void): () => void
  onNavigate(cb: (target: NavTarget) => void): () => void
  onBookOpened(cb: (tree: BookTree) => void): () => void
  onMenu(cb: (command: MenuCommand) => void): () => void
}

export type MenuCommand = 'new-chapter' | 'new-scene' | 'import' | 'close-book' | 'settings' | 'toggle-chat'

/** Where a link in chat, an alert or the bible points. */
export type NavTarget =
  | { kind: 'scene'; sceneId: string; file?: SceneFile; quote?: string }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'page'; name: PageName; quote?: string }
  | { kind: 'bible'; id?: string }
  | { kind: 'timeline' }
  | { kind: 'alerts'; id?: string }
  | { kind: 'change'; id: string }
  | { kind: 'diagrams' }
  | { kind: 'history' }
