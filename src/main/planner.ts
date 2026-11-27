// The planner: one long-lived session per book that does everything that is
// thinking. It keeps the whole book in cached context and receives the
// author's chat, comments and edits as events appended to the same session.
// It acts through tools; any tool that touches the author's words produces a
// suggestion, never a direct write, and it never writes prose for the book
// itself: it briefs the writer.

import type { BetaContentBlockParam, BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { z } from 'zod'
import { CYBERKITTY_BRIEFING } from '@shared/briefing'
import { linkFor } from '@shared/links'
import type { BibleType, ChatEntry, DocRef, PageName, PassageRef, Place, SceneFile } from '@shared/types'
import { agentTurn, describeError, isAbort, isBadRequest, type SystemBlocks } from './gateway'
import { pendingChat } from './context'
import { closeBatch, eventsSince, lastSeq, logEvent, renderBatches } from './eventlog'
import { bookContextFor, COLD_MS } from './snapshot'
import { loadSettings } from './settings'
import { newId, requireBook, send } from './state'
import { chatStore } from './stores'
import { locate, suggest } from './suggest'
import { rewrite, runDraft } from './writer'
import { addIdea } from './bible'
import { addTodo, fileAlert } from './alerts'
import { proposeChange } from './changes'
import { drawDiagram } from './diagrams'

const PAGES: PageName[] = ['book.md', 'summary.md', 'theme.md', 'tropes.md', 'characters.md', 'outline.md', 'style.md', 'bible.md']

export const PLANNER_INSTRUCTIONS = `You are the planner, in the chat.

What you have:
- Below is a snapshot of the whole book: the style page, direction pages, the bible, the outline, chapter intents, scene summaries, notes and prose with their ids, open alerts, and the conversation so far. It was frozen a while ago so it can stay cached. After it comes the history since: everything that happened, oldest first, including the author's edits, each giving the changed paragraphs as they now read and what they replaced. The author keeps working while you talk, so each of their messages starts with what happened since your last reply (your own tool actions are left out; you know those). The newest version of a paragraph is the one that counts, and read_doc gives you any document's current text.
- Each message carries the author's place (page, paragraph under the cursor, selection) and any passages they attached.
- Your tools act on the page as described in the guide above. Quote text exactly as it appears when a tool needs a quote; tool results hand back ck: links to what you made, which you can put in your reply.

How the division of work is set up:
- Planning text (direction pages, the outline, chapter intents, scene notes, the style page, bible.md) can take your own words directly, through suggest_edit and suggest_insert.
- Prose for the book goes through the writer, which carries the author's style page and their past corrections. You give it a brief with rewrite_prose or draft_prose: what the passage must do, the beats, the facts that matter, pinned lines, what to avoid. The prose tools are the only way to put prose on the page.
- Authors differ in how much they want Claude to lead. Some want proposals on every page; some want a quiet second reader. Read what this author asks for and how they respond to what you offer, and follow their lead.

When you write in the chat, ck: links let the author click straight to what you mean, and the app's mark names (unreviewed, updated, suggested, conflict) mean the same thing to them as in the key.`

const HELP_LEVEL: Record<string, string> = {
  quiet: 'The author set Settings to say they want Claude to volunteer little: answer what they ask, and raise only clear problems unprompted.',
  some: 'The author left Settings at the middle setting for how much Claude volunteers.',
  lots: 'The author set Settings to say they want Claude to volunteer a lot: what could happen next, texture and staging, connections to arcs and later chapters, craft opportunities, first passes on thin pages.'
}

// ---- Tools -----------------------------------------------------------------

const docSchema = {
  type: 'object',
  description: 'Which document: a scene file (scene_id and file), a chapter intent (chapter_id), or a book page (page).',
  properties: {
    scene_id: { type: 'string' },
    file: { type: 'string', enum: ['notes', 'prose'] },
    chapter_id: { type: 'string' },
    page: { type: 'string', enum: PAGES }
  }
}

const zDoc = z.object({
  scene_id: z.string().optional(),
  file: z.enum(['notes', 'prose']).optional(),
  chapter_id: z.string().optional(),
  page: z.enum(PAGES as [PageName, ...PageName[]]).optional()
})

function toRef(d: z.infer<typeof zDoc>): DocRef {
  if (d.scene_id) return { kind: 'scene', sceneId: d.scene_id, file: (d.file ?? 'notes') as SceneFile }
  if (d.chapter_id) return { kind: 'chapter', chapterId: d.chapter_id }
  if (d.page) return { kind: 'page', name: d.page }
  throw new Error('Name a document: scene_id with file, chapter_id, or page.')
}

export const TOOLS: BetaToolUnion[] = [
  {
    name: 'read_doc',
    description: 'Read the current text of a document. Use it before quoting anything that may have changed since the snapshot.',
    input_schema: { type: 'object', properties: { doc: docSchema }, required: ['doc'] }
  },
  {
    name: 'suggest_edit',
    description: 'Suggest replacing an exact quote in notes, a chapter intent or a book page with new text. Not for prose: use rewrite_prose.',
    input_schema: {
      type: 'object',
      properties: { doc: docSchema, quote: { type: 'string' }, replacement: { type: 'string' }, note: { type: 'string', description: 'Why, in a few words. Shown on hover.' } },
      required: ['doc', 'quote', 'replacement', 'note']
    }
  },
  {
    name: 'suggest_insert',
    description: 'Suggest new lines after an exact quote (or at the end when after_quote is empty) in notes, a chapter intent or a book page. Use for proposed beats, outline entries, page sections. Not for prose: use draft_prose.',
    input_schema: {
      type: 'object',
      properties: { doc: docSchema, after_quote: { type: 'string' }, text: { type: 'string' }, note: { type: 'string' } },
      required: ['doc', 'after_quote', 'text', 'note']
    }
  },
  {
    name: 'rewrite_prose',
    description: 'Have the writer rewrite an exact span of a scene’s prose in the author’s style, following your brief. The result is a suggestion.',
    input_schema: {
      type: 'object',
      properties: { scene_id: { type: 'string' }, quote: { type: 'string' }, brief: { type: 'string', description: 'What should change and why, as notes. No sentences.' } },
      required: ['scene_id', 'quote', 'brief']
    }
  },
  {
    name: 'draft_prose',
    description: 'Have the writer draft new prose for a scene from beats and a brief, placed after an exact quote of the prose (or at the end when after_quote is empty). The result is a suggestion.',
    input_schema: {
      type: 'object',
      properties: { scene_id: { type: 'string' }, after_quote: { type: 'string' }, beats: { type: 'string' }, brief: { type: 'string' } },
      required: ['scene_id', 'after_quote', 'beats', 'brief']
    }
  },
  {
    name: 'add_bible_idea',
    description: 'Propose a fact the story could have that the text does not say yet. It appears in the bible as unreviewed until the author keeps or dismisses it.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['character', 'event', 'movement', 'place', 'world'] },
        subject: { type: 'string' },
        text: { type: 'string' },
        why: { type: 'string' }
      },
      required: ['type', 'subject', 'text', 'why']
    }
  },
  {
    name: 'file_alert',
    description: 'File a problem for the alerts page: a contradiction, a timeline impossibility, a scene that no longer fits the direction, or a loose thread. Quote both sides exactly.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['continuity', 'timeline', 'direction', 'thread'] },
        title: { type: 'string' },
        explanation: { type: 'string' },
        fix: { type: 'string' },
        sides: { type: 'array', items: { type: 'object', properties: { doc: docSchema, quote: { type: 'string' } }, required: ['doc', 'quote'] } }
      },
      required: ['kind', 'title', 'explanation', 'sides']
    }
  },
  {
    name: 'add_todo',
    description: 'Add a plain todo to the alerts page, e.g. "plant the knife in chapter 3".',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, scene_id: { type: 'string' } }, required: ['text'] }
  },
  {
    name: 'propose_change_spec',
    description: 'Start a chapter-scale change: writes a change spec (goal, what changes scene by scene, what must not change, effects elsewhere) that the author edits and approves before anything is rewritten.',
    input_schema: { type: 'object', properties: { chapter_id: { type: 'string' }, request: { type: 'string', description: 'The change the author wants, with what you learned in conversation.' } }, required: ['chapter_id', 'request'] }
  },
  {
    name: 'draw_diagram',
    description: 'Draw a diagram from the bible: a map, floor plan, family tree or relationship web.',
    input_schema: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] }
  }
]

type ToolOut = { text: string; activity?: string }

async function runTool(name: string, raw: unknown, chatId: string, signal: AbortSignal): Promise<ToolOut> {
  const input = (raw ?? {}) as Record<string, unknown>
  switch (name) {
    case 'read_doc': {
      const ref = toRef(zDoc.parse(input.doc))
      const text = (await requireBook().readDoc(ref)).text
      return { text: text ?? '(this document does not exist yet)' }
    }
    case 'suggest_edit':
    case 'suggest_insert': {
      const p = z
        .object({ doc: zDoc, quote: z.string().optional(), after_quote: z.string().optional(), replacement: z.string().optional(), text: z.string().optional(), note: z.string().default('') })
        .parse(input)
      const ref = toRef(p.doc)
      if (ref.kind === 'scene' && ref.file === 'prose') throw new Error('Prose is the writer’s job. Use rewrite_prose or draft_prose with a brief.')
      const insert = name === 'suggest_insert'
      const quote = insert ? (p.after_quote ?? '') : (p.quote ?? '')
      const replacement = insert ? (p.text ?? '') : (p.replacement ?? '')
      const rec = await suggest({ ref, quote, replacement, insert: insert ? 'after' : undefined, note: p.note, source: 'chat', chatId })
      return { text: `Suggested. Link: ${linkFor(ref, rec.anchor.quote.slice(0, 60))}`, activity: `suggested ${insert ? 'an addition' : 'an edit'} in ${await label(ref)}` }
    }
    case 'rewrite_prose': {
      const p = z.object({ scene_id: z.string(), quote: z.string(), brief: z.string() }).parse(input)
      const ref: DocRef = { kind: 'scene', sceneId: p.scene_id, file: 'prose' }
      const text = (await requireBook().readDoc(ref)).text ?? ''
      const at = locate(text, p.quote)
      if (!at) throw new Error(`Could not find that quote in ${p.scene_id}. Read it again and quote it exactly.`)
      const context = text.slice(Math.max(0, at.from - 1500), Math.min(text.length, at.to + 1500))
      const replacement = await rewrite({ ref, quote: text.slice(at.from, at.to), context, instruction: 'Follow the brief.', brief: p.brief }, 'writer')
      const rec = await suggest({ ref, quote: text.slice(at.from, at.to), replacement, note: 'rewrite from chat', source: 'rewrite', chatId })
      return { text: `The writer's rewrite is on the page as a suggestion. Link: ${linkFor(ref, rec.anchor.quote.slice(0, 60))}`, activity: `the writer rewrote a passage in ${await label(ref)}` }
    }
    case 'draft_prose': {
      const p = z.object({ scene_id: z.string(), after_quote: z.string(), beats: z.string(), brief: z.string() }).parse(input)
      const ref: DocRef = { kind: 'scene', sceneId: p.scene_id, file: 'prose' }
      const text = (await requireBook().readDoc(ref)).text ?? ''
      const at = p.after_quote ? locate(text, p.after_quote) : null
      const cut = at ? text.indexOf('\n\n', at.to) : -1
      const split = at ? (cut === -1 ? text.length : cut) : text.length
      const lane = (await loadSettings()).lanes.writer
      const res = await runDraft({ sceneId: p.scene_id, beats: p.beats, proseBefore: text.slice(0, split), proseAfter: text.slice(split) }, lane, signal, () => undefined, p.brief)
      if (!res.ok || !res.text) throw new Error(res.error ?? 'The writer returned nothing.')
      const anchorQuote = at ? text.slice(at.from, at.to) : ''
      const rec = await suggest({ ref, quote: anchorQuote, replacement: res.text, insert: 'after', note: 'drafted from chat', source: 'rewrite', chatId })
      return { text: `The writer's draft is on the page as a suggestion. Link: ${linkFor(ref, rec.anchor.quote.slice(0, 60))}`, activity: `the writer drafted a passage in ${await label(ref)}` }
    }
    case 'add_bible_idea': {
      const p = z.object({ type: z.enum(['character', 'event', 'movement', 'place', 'world']), subject: z.string(), text: z.string(), why: z.string() }).parse(input)
      const e = await addIdea(p.type as BibleType, p.subject, p.text, p.why, chatId)
      return { text: `Added as an unreviewed idea. Link: ${linkFor({ kind: 'bible', id: e.id })}`, activity: `added a bible idea about ${p.subject}` }
    }
    case 'file_alert': {
      const p = z
        .object({ kind: z.enum(['continuity', 'timeline', 'direction', 'thread']), title: z.string(), explanation: z.string(), fix: z.string().optional(), sides: z.array(z.object({ doc: zDoc, quote: z.string() })) })
        .parse(input)
      const a = await fileAlert({ kind: p.kind, title: p.title, explanation: p.explanation, fix: p.fix, sides: p.sides.map((s) => ({ ref: toRef(s.doc), quote: s.quote })) })
      return a ? { text: `Filed. Link: ${linkFor({ kind: 'alert', id: a.id })}`, activity: `filed an alert: ${p.title}` } : { text: 'Not filed: the quotes were not found in the text, or the author dismissed this exact pair before.' }
    }
    case 'add_todo': {
      const p = z.object({ text: z.string(), scene_id: z.string().optional() }).parse(input)
      const a = await addTodo(p.text, p.scene_id)
      return { text: `Added. Link: ${linkFor({ kind: 'alert', id: a.id })}`, activity: `added a todo` }
    }
    case 'propose_change_spec': {
      const p = z.object({ chapter_id: z.string(), request: z.string() }).parse(input)
      const c = await proposeChange(p.chapter_id, p.request)
      return { text: `Change spec drafted for the author to edit and approve. Link: ${linkFor({ kind: 'change', id: c.id })}`, activity: `drafted a change spec: ${c.title}` }
    }
    case 'draw_diagram': {
      const p = z.object({ request: z.string() }).parse(input)
      const d = await drawDiagram(p.request)
      return { text: `Drawn: ${d.title}. It is on the Diagrams page.`, activity: `drew a diagram: ${d.title}` }
    }
    default:
      throw new Error(`Unknown tool ${name}`)
  }
}

async function label(ref: DocRef): Promise<string> {
  if (ref.kind === 'page') return ref.name.replace(/\.md$/, '')
  if (ref.kind === 'chapter') return (await requireBook().tree()).chapters.find((c) => c.id === ref.chapterId)?.title ?? 'the chapter'
  const s = (await requireBook().scenes()).find((x) => x.id === ref.sceneId)
  return `${s?.title ?? 'the scene'} ${ref.file}`
}

// ---- Session --------------------------------------------------------------

interface Session {
  system: SystemBlocks
  messages: BetaMessageParam[]
  /** The last event in the log the planner has been told about. */
  seenSeq: number
  /** When the session last called Claude; past COLD_MS its cache has expired anyway. */
  lastAt: number
  /** Prompt size of the first request, and of the latest one. */
  baseTokens: number
  lastTokens: number
  /** What the author saw of a reply they stopped, to tell the planner next time. */
  stopped?: string
}

let session: Session | null = null
let running: AbortController | null = null
let queue: Promise<void> = Promise.resolve()

/** Conversation past this many tokens beyond the book starts a new session (the frozen book is reused while warm). */
const MAX_CONVERSATION_TOKENS = 100_000
/** What happened since the last message is sent in full up to this size, and as headlines past it. */
const INLINE_HISTORY_CHARS = 40_000

export function resetPlanner(): void {
  running?.abort()
  session = null
}

async function startSession(): Promise<Session> {
  const settings = await loadSettings()
  const book = await bookContextFor('planner', { style: true, notes: true, history: true })
  const history = book.history.length ? book.history.join('\n') : '<events>\n(nothing has happened since the snapshot)\n</events>'
  // Four breakpoints, from never-changing to per-session: instructions, the
  // frozen book (with the conversation so far), the log since it, and the
  // growing conversation (automatic). All one hour: the author replies at a
  // human pace. The guide carries no breakpoint of its own here but matches
  // the one other calls write, so it can still be read from cache.
  const system: SystemBlocks = [
    { type: 'text', text: CYBERKITTY_BRIEFING },
    { type: 'text', text: `${PLANNER_INSTRUCTIONS}\n\n${HELP_LEVEL[settings.blockingHelp] ?? HELP_LEVEL.some}`, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: book.snapshot, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: `<history_since_snapshot>\n${history}\n</history_since_snapshot>`, cache_control: { type: 'ephemeral', ttl: '1h' } }
  ]
  return { system, messages: [], seenSeq: lastSeq(), lastAt: Date.now(), baseTokens: 0, lastTokens: 0 }
}

function needsNewSession(s: Session | null, now: number): boolean {
  if (!s) return true
  // A cold cache costs the same either way, so start fresh with a current book.
  if (now - s.lastAt > COLD_MS) return true
  if (s.baseTokens && s.lastTokens - s.baseTokens > MAX_CONVERSATION_TOKENS) return true
  return s.messages.length > 400
}

/**
 * Leave the conversation valid after a stop or an error: every tool call
 * needs a result before the next message, so calls that never ran get one.
 */
function repair(s: Session): void {
  const last = s.messages.at(-1)
  if (last?.role !== 'assistant' || !Array.isArray(last.content)) return
  const ids = last.content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : []))
  if (!ids.length) return
  s.messages.push({ role: 'user', content: ids.map((id) => ({ type: 'tool_result' as const, tool_use_id: id, content: 'This did not run: the author stopped the reply.', is_error: true })) })
}

function placeXml(place: Place): string {
  const attrs = [`label="${place.label.replace(/"/g, "'")}"`, `page="${place.page}"`]
  if (place.sceneId) attrs.push(`scene_id="${place.sceneId}"`)
  if (place.file) attrs.push(`file="${place.file}"`)
  if (place.chapterId) attrs.push(`chapter_id="${place.chapterId}"`)
  if (place.pageName) attrs.push(`page_name="${place.pageName}"`)
  const inner = [place.paragraph ? `<paragraph>${place.paragraph}</paragraph>` : '', place.selection ? `<selection>${place.selection}</selection>` : '']
    .filter(Boolean)
    .join('\n')
  return `<place ${attrs.join(' ')}>${inner ? `\n${inner}\n` : ''}</place>`
}

/** What happened since the planner last heard (its own doings left out), in full when it fits. */
async function historySince(s: Session): Promise<string> {
  await closeBatch()
  const list = eventsSince(s.seenSeq, 'planner')
  s.seenSeq = lastSeq()
  if (!list.length) return ''
  const full = renderBatches(list).join('\n')
  if (full.length <= INLINE_HISTORY_CHARS) return `<since_your_last_reply>\n${full}\n</since_your_last_reply>`
  // Too much to include: the first line of each event; read_doc gives the current text.
  return `<since_your_last_reply>\nToo much happened to include in full. In order (read_doc gives any document's current text):\n${list.map((e) => e.text.split('\n')[0]).join('\n')}\n</since_your_last_reply>`
}

async function pushEntries(update: (entries: ChatEntry[]) => ChatEntry[]): Promise<ChatEntry[]> {
  const next = await chatStore.update(update)
  send('chat', next)
  return next
}

/** The author sends a chat message (or a comment on a passage). */
export function sendChat(text: string, place: Place, passages: PassageRef[]): Promise<void> {
  const run = queue.then(() => turn(text, place, passages))
  queue = run.catch(() => undefined)
  return run
}

export function stopChat(): void {
  running?.abort()
}

async function turn(text: string, place: Place, passages: PassageRef[]): Promise<void> {
  const authorEntry: ChatEntry = { id: newId('c'), role: 'author', text, at: new Date().toISOString(), place, passages }
  const replyId = newId('c')
  // The message reaches Claude as the event in hand, so book snapshots taken
  // meanwhile leave it out of the conversation so far.
  pendingChat.add(authorEntry.id)
  await pushEntries((e) => [...e, authorEntry, { id: replyId, role: 'claude', text: '', at: new Date().toISOString(), streaming: true }])

  const ctrl = new AbortController()
  running = ctrl
  let reply = ''
  const flush = (streaming: boolean, error = false): Promise<ChatEntry[]> =>
    pushEntries((e) => e.map((x) => (x.id === replyId ? { ...x, text: reply, streaming, error } : x)))
  let lastFlush = 0

  try {
    if (needsNewSession(session, Date.now())) session = await startSession()
    const s = session!
    const history = await historySince(s)
    // Into the log, so the writer and later sessions see it; the planner has it as this event.
    const quoted = passages.length ? `\nAttached: ${passages.map((p) => `“${p.quote}”`).join(' ')}` : ''
    logEvent('author', `The author wrote in the chat (on ${place.label}): ${text}${quoted}`)
    s.seenSeq = lastSeq()
    pendingChat.delete(authorEntry.id)
    const stopped = s.stopped
    s.stopped = undefined
    const passageXml = passages.length
      ? `<attached_passages>\n${passages.map((p) => `<passage doc="${p.ref.kind === 'scene' ? `${p.ref.sceneId} ${p.ref.file}` : p.ref.kind === 'page' ? p.ref.name : p.ref.chapterId}">${p.quote}</passage>`).join('\n')}\n</attached_passages>`
      : ''
    // What happened since the last reply comes first; the author's message last.
    const content: BetaContentBlockParam[] = [
      ...(history ? [{ type: 'text' as const, text: history }] : []),
      {
        type: 'text',
        text: [
          `<event type="${passages.length ? 'comment' : 'chat'}" at="${authorEntry.at}">`,
          placeXml(place),
          stopped !== undefined ? `<your_last_reply_was_stopped>\nThe author stopped your previous reply. What they saw of it:\n${stopped || '(nothing yet)'}\n</your_last_reply_was_stopped>` : '',
          passageXml,
          `<message>\n${text}\n</message>`,
          '</event>'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ]
    s.messages.push({ role: 'user', content })
    const lane = (await loadSettings()).lanes.planner

    for (let i = 0; i < 12; i++) {
      // The cache's lifetime runs from the start of each request.
      s.lastAt = Date.now()
      const res = await agentTurn({
        lane,
        system: s.system,
        tools: TOOLS,
        messages: s.messages,
        signal: ctrl.signal,
        onText: (d) => {
          reply += d
          if (Date.now() - lastFlush > 120) {
            lastFlush = Date.now()
            void flush(true)
          }
        }
      })
      s.messages.push({ role: 'assistant', content: res.content as BetaContentBlockParam[] })
      if (res.promptTokens) {
        if (!s.baseTokens) s.baseTokens = res.promptTokens
        s.lastTokens = res.promptTokens
      }
      if (res.stopReason === 'refusal') {
        reply += reply ? '\n\n' : ''
        reply += 'I can’t help with that one. You can rephrase it, or pick another planner model in Settings.'
        break
      }
      if (res.stopReason === 'pause_turn') continue
      const uses = res.content.filter((b) => b.type === 'tool_use')
      if (res.stopReason !== 'tool_use' || !uses.length) break
      if (reply && !reply.endsWith('\n')) reply += '\n\n'
      const results: BetaContentBlockParam[] = []
      for (const u of uses) {
        if (u.type !== 'tool_use') continue
        try {
          const out = await runTool(u.name, u.input, replyId, ctrl.signal)
          results.push({ type: 'tool_result', tool_use_id: u.id, content: out.text })
          if (out.activity) logEvent('planner', `The planner: ${out.activity}`, 'planner')
          if (out.activity) await pushEntries((e) => [...e.filter((x) => x.id !== replyId), { id: newId('a'), role: 'activity', text: out.activity!, at: new Date().toISOString() }, ...e.filter((x) => x.id === replyId)])
        } catch (err) {
          if (isAbort(err)) throw err
          results.push({ type: 'tool_result', tool_use_id: u.id, content: err instanceof Error ? err.message : String(err), is_error: true })
        }
      }
      s.messages.push({ role: 'user', content: results })
    }
    await flush(false)
    if (reply.trim()) logEvent('planner', `The planner replied: ${reply.trim()}`)
  } catch (err) {
    // Keep the session (and its cache) through a stop or a passing error: the
    // conversation is repaired so it stays valid, and the planner hears what
    // happened. Only a request the API rejected starts over.
    const s = session
    if (isAbort(err)) {
      if (s) {
        repair(s)
        s.stopped = reply
      }
      logEvent('author', `The author stopped the planner's reply${reply.trim() ? ` after: ${reply.trim()}` : '.'}`)
      reply += reply ? ' …' : '(stopped)'
      await flush(false)
    } else {
      if (s && !isBadRequest(err)) repair(s)
      else session = null
      reply = reply ? `${reply}\n\n${describeError(err)}` : describeError(err)
      await flush(false, true)
    }
  } finally {
    running = null
    pendingChat.delete(authorEntry.id)
  }
}
