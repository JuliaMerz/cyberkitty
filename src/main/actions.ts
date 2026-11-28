// Every channel the UI can call in the main process, and what the event log
// says about it. The rule: a channel is either logged here or marked quiet
// with the reason, and test/actions.test.ts fails when a channel the preload
// exposes is missing, so a new action cannot skip the log by accident.
//
// index.ts registers handlers only through `handle` and `on`, which apply
// this table in one order for every action:
// 1. flush: the UI saves typing it is still holding back (it saves 400ms
//    after a keystroke), so the action and the log see the current text;
// 2. the edits made before the action are logged, then the action itself;
// 3. the action runs, and what it changed (edits, marks, bible, alerts) is
//    logged right after it;
// 4. a request that comes back as failed is logged as failed.

import type { AlternativesRequest, BibleEntry, ChangeSpec, DocRef, DraftRequest, NotePlace, RewriteRequest, Settings } from '@shared/types'
import { requireBook, state } from './state'
import { bibleStore, changeStore, diagramStore } from './stores'

export interface ActionEntry {
  /** What the log says about this call, or null to say nothing this time. */
  log?: (...args: never[]) => string | null | Promise<string | null>
  /** Why this channel is not logged: a read, or something logged elsewhere. */
  quiet?: string
  /** Save the UI's held-back typing before running. */
  flush?: boolean
}

export const HUMANIZE_NAMES: Record<string, string> = { plainer: 'plainer', shorter: 'shorter', rougher: 'rougher', concrete: 'more concrete', sample: 'closer-to-my-samples' }

/** Draft jobs in flight, by job id, so a stop can say which scene it was. */
export const draftJobs = new Map<string, string>()

export async function sceneTitle(sceneId: string): Promise<string> {
  return (await requireBook().scenes()).find((s) => s.id === sceneId)?.title ?? sceneId
}

export async function noteLabel(id: string): Promise<string> {
  const n = await requireBook().readNote(id)
  return `the note “${n?.title ?? id.split('/').pop()}” (${id})`
}

export async function refLabelFor(ref: DocRef): Promise<string> {
  if (ref.kind === 'note') return noteLabel(ref.id)
  if (ref.kind === 'page') return `the ${ref.name} page`
  if (ref.kind === 'chapter') return `the intent of ${ref.chapterId}`
  return `the ${ref.file} of “${await sceneTitle(ref.sceneId)}” (${ref.sceneId})`
}

/** Where a note is going, in words. */
async function placeWords(place: NotePlace): Promise<string> {
  if (place.where === 'notes') return place.folder && place.folder !== 'notes' ? `the Notes section, in ${place.folder.slice('notes/'.length)}` : 'the Notes section'
  const where = place.chapterId ? `among the scenes of ${await chapterLabel(place.chapterId)}` : 'among the chapters'
  if (place.after === null) return `${where}, first`
  const tree = await requireBook().tree()
  const after =
    tree.chapters.find((c) => c.id === place.after)?.title ??
    tree.chapters.flatMap((c) => c.scenes).find((s) => s.id === place.after)?.title ??
    [...tree.notes, ...tree.manuscriptNotes, ...tree.chapters.flatMap((c) => c.notes)].find((n) => n.id === place.after)?.title ??
    place.after
  return `${where}, after “${after}”`
}

async function chapterLabel(chapterId: string): Promise<string> {
  const c = (await requireBook().tree()).chapters.find((x) => x.id === chapterId)
  return c ? `chapter ${c.number}, “${c.title}” (${c.id})` : chapterId
}

const onOff = (v: unknown): string => (v ? 'on' : 'off')

/** The settings Claude's work depends on, in words. Display-only settings are left out. */
const SETTING_WORDS: Partial<Record<keyof Settings, (v: never) => string>> = {
  blockingHelp: (v: Settings['blockingHelp']) => `how much Claude volunteers: ${v}`,
  reviewWhenSeen: (v: boolean) => `count a paragraph as reviewed once it has been on screen: ${onOff(v)}`,
  ghostText: (v: boolean) => `ghost text: ${onOff(v)}`,
  alternativesAhead: (v: boolean) => `prepare alternatives right after a draft: ${onOff(v)}`,
  settleSeconds: (v: number) => `work settles after ${v} seconds without typing`,
  scanIdleMinutes: (v: number) => `the whole-book scan runs after ${v} idle minutes`,
  lanes: (v: Settings['lanes']) => `models: ${Object.entries(v).map(([lane, l]) => `${lane} ${l.model} (${l.effort} effort)`).join(', ')}`
}

export function settingsText(patch: Partial<Settings>): string | null {
  const parts = Object.entries(patch).flatMap(([k, v]) => {
    const words = SETTING_WORDS[k as keyof Settings] as ((x: unknown) => string) | undefined
    return words ? [words(v)] : []
  })
  return parts.length ? `The author changed Settings: ${parts.join('; ')}.` : null
}

const READ = 'a read'

export const HANDLED: Record<string, ActionEntry> = {
  'settings:get': { quiet: READ },
  'settings:set': { log: (patch: Partial<Settings>) => (state.book ? settingsText(patch) : null) },
  'key:has': { quiet: READ },
  'key:set': { quiet: 'the API key is never logged' },
  'spend:get': { quiet: READ },

  'book:open-dialog': { quiet: 'opens a book; each book keeps its own log', flush: true },
  'book:create-dialog': { quiet: 'opens a book; each book keeps its own log', flush: true },
  'book:open-sample': { quiet: 'opens a book; each book keeps its own log', flush: true },
  'book:open': { quiet: 'opens a book; each book keeps its own log', flush: true },
  'book:close': { quiet: 'closes the book', flush: true },
  'book:import': { quiet: 'imported scenes are logged as new documents', flush: true },
  'book:get': { quiet: READ },
  'book:create-chapter': { quiet: 'the new chapter is logged as a new document', flush: true },
  'book:create-scene': { quiet: 'the new scene is logged as a new document', flush: true },
  'book:rename-scene': { quiet: 'logged as an edit to the scene heading', flush: true },
  'book:create-note': { quiet: 'the new note is logged as a new document', flush: true },
  'book:move-note': { flush: true, log: async (id: string, place: NotePlace) => `The author moved ${await noteLabel(id)} to ${await placeWords(place)}.` },
  'book:note-to-scene': { flush: true, log: async (id: string) => `The author turned ${await noteLabel(id)} into a scene, in the same place: its text is now that scene's notes, ready for beats and drafting.` },
  'book:scene-to-note': { flush: true, log: async (sceneId: string) => `The author turned the scene “${await sceneTitle(sceneId)}” (${sceneId}), which had no prose, into a note in the same place.` },

  'doc:read': { quiet: READ },
  'doc:write': { quiet: 'edits are compared and logged in batches, not per save' },
  'doc:write-marks': { quiet: 'Book.writeDocMarks tells the log about every mark' },

  'draft:start': {
    flush: true,
    log: async (req: DraftRequest) =>
      `The author pressed Draft it in “${await sceneTitle(req.sceneId)}” (${req.sceneId})${req.beats?.trim() ? `, for these beats:\n${req.beats.trim()}` : req.proseAfter.trim() ? ', at a gap in the prose' : ''}`
  },
  'tool:alternatives': {
    flush: true,
    log: async (req: AlternativesRequest) => `The author asked for other ways to say “${req.sentence.trim()}” in “${await sceneTitle(req.sceneId)}” (${req.sceneId})`
  },
  'tool:rewrite': {
    flush: true,
    log: async (req: RewriteRequest) =>
      `The author asked the writer for ${req.tool ? `a ${HUMANIZE_NAMES[req.tool] ?? req.tool} version` : 'a rewrite'} of a passage in ${await refLabelFor(req.ref)}: “${req.quote.trim()}”${req.instruction ? `\nTheir instruction: ${req.instruction}` : ''}`
  },
  'tool:ghost': { quiet: 'ghost text only counts once taken, and then it is an edit' },

  'chat:get': { quiet: READ },
  'chat:send': { quiet: 'the planner logs each message, after what happened before it', flush: true },

  'bible:get': { quiet: READ },
  'bible:save': {
    log: async (e: BibleEntry) => {
      const prev = (await bibleStore.read()).find((x) => x.id === e.id)
      if (e.source.kind === 'idea' && e.source.status !== 'pending' && prev?.source.kind === 'idea' && prev.source.status !== e.source.status)
        return `The author ${e.source.status === 'kept' ? 'kept' : 'dismissed'} Claude's bible idea “${e.subject}”.`
      if (prev && prev.text === e.text && prev.subject === e.subject) return null
      return `The author ${prev ? 'edited' : 'added'} the story bible entry “${e.subject}”.`
    }
  },
  'bible:delete': {
    log: async (id: string) => `The author deleted the story bible entry “${(await bibleStore.read()).find((e) => e.id === id)?.subject ?? id}”.`
  },
  'summaries:get': { quiet: READ },
  'summaries:seen': { quiet: 'only whether the author has seen a summary change' },
  'settle:now': { quiet: 'background catch-up; what it changes is logged', flush: true },

  'diagrams:get': { quiet: READ },
  'diagrams:draw': { flush: true, log: (request: string) => `The author asked for a diagram: ${request}` },
  'diagrams:delete': {
    log: async (id: string) => `The author deleted the diagram “${(await diagramStore.read()).find((d) => d.id === id)?.title ?? id}”.`
  },

  'alerts:get': { quiet: READ },
  'alerts:status': { quiet: 'the alert comparison logs it, with who changed it' },
  'alerts:todo': { quiet: 'the alert comparison logs new todos' },
  'alerts:scan': { flush: true, log: () => 'The author asked for a consistency scan of the whole book.' },

  'changes:get': { quiet: READ },
  'changes:propose': {
    flush: true,
    log: async (chapterId: string, request: string) => `The author asked for a chapter change in ${await chapterLabel(chapterId)}: ${request}`
  },
  'changes:save': {
    log: async (c: ChangeSpec) => {
      const prev = (await changeStore.read()).find((x) => x.id === c.id)
      if (c.status === 'discarded' && prev?.status !== 'discarded') return `The author discarded the chapter change “${c.title}”.`
      if (prev && prev.spec !== c.spec) return `The author edited the spec of the chapter change “${c.title}”. It now reads:\n${c.spec}`
      return null
    }
  },
  'changes:run': {
    flush: true,
    log: async (id: string) => `The author had the writer carry out the chapter change “${(await changeStore.read()).find((c) => c.id === id)?.title ?? id}”. The rewrites go into the change for review, not into the book.`
  },
  'changes:merge': {
    flush: true,
    log: async (id: string, decisions: unknown[]) =>
      `The author merged the chapter change “${(await changeStore.read()).find((c) => c.id === id)?.title ?? id}” into the book (${decisions.length} decision${decisions.length === 1 ? '' : 's'}). The edits it made follow.`
  },
  'changes:undo': {
    flush: true,
    log: async (id: string) => `The author undid the chapter change “${(await changeStore.read()).find((c) => c.id === id)?.title ?? id}”. The edits it made follow.`
  },

  'history:get': { quiet: READ },
  'history:restore': {
    flush: true,
    log: async (oid: string) => {
      const entry = (await state.history?.log(200))?.find((e) => e.oid === oid)
      const when = entry ? new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ') : 'an earlier time'
      return `The author restored the book to how it was at ${when}${entry ? ` (${entry.message})` : ''}. The edits it made follow.`
    }
  }
}

export const SENT: Record<string, ActionEntry> = {
  'doc:open-docs': { quiet: 'which documents are open in the UI' },
  activity: { quiet: 'where the author is; each chat message carries the place' },
  correction: { quiet: 'kept as corrections, which the writer gets with each task' },
  'draft:cancel': {
    log: (jobId: string) => {
      const scene = draftJobs.get(jobId)
      return scene ? `The author stopped the draft in ${scene}. What was written so far stays in the prose.` : null
    }
  },
  'draft:detach': { quiet: 'the draft carries on into the file; what it writes is logged as edits' },
  'chat:stop': { quiet: 'the planner logs the stop with what the author saw' },
  'editors-flushed': { quiet: 'the UI saying held-back typing is saved' }
}
