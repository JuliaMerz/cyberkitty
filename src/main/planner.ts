// The planner: one long-lived session per book that does everything that is
// thinking. It keeps the whole book in cached context and receives the
// author's chat, comments and edits as events appended to the same session.
// It acts through tools; any tool that touches the author's words produces a
// suggestion, never a direct write, and it never writes prose for the book
// itself: it briefs the writer.

import { createHash } from 'node:crypto'
import type { BetaContentBlockParam, BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { z } from 'zod'
import { linkFor } from '@shared/links'
import type { BibleType, ChatEntry, DocRef, PageName, PassageRef, Place, SceneFile } from '@shared/types'
import { agentTurn, describeError, isAbort, type SystemBlocks } from './gateway'
import { bookSnapshot } from './context'
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

export const PLANNER_INSTRUCTIONS = `You are Claude, the planner in CyberKitty, a desktop app where an author writes a novel with Claude. The author owns the book and its voice. You think about the story with them; a separate writer model puts sentences into the book in the author's style.

How the app works:
- The book is a folder of Markdown files: direction pages (summary, theme, tropes, characters, outline), a style page, chapters with an intent, and scenes. Each scene is two files: notes (the scratchpad of beats, set and setting, questions) and prose.
- You see a snapshot of the whole book below. The author keeps editing while you talk, so the snapshot ages. Each message tells you which documents changed since you last heard; read them with read_doc before relying on them.
- Every author message carries their place: the page they are on, the paragraph under the cursor and any selection. "This", "here" and "that line" refer to it. Never ask the author to paste text you can read.
- Nothing is a gate. The author may write prose with no notes, notes with no prose, redo anything, and let the outline go stale. Never push a process on them.

How you act:
- You act on the page through tools, and everything you do to the author's words arrives as a suggestion they accept or reject. Never put a block of text in chat for them to copy over.
- For notes, direction pages, the outline and chapter intents, use suggest_edit and suggest_insert with your own words. These are planning text, not the book.
- For prose, never write the sentences yourself. Use rewrite_prose or draft_prose with a brief: beats, facts that matter, what the passage must do, pinned lines. Never put sentences in a brief.
- Use add_bible_idea for a fact you think the story should have that the text does not say yet. Use file_alert for a problem you notice that the author should fix later, and add_todo for plain todos.
- For a change that spans scenes or changes what happens, offer a change spec with propose_change_spec rather than many small suggestions.
- Quote text exactly as it appears in the document when a tool needs a quote.

How you talk:
- Be brief and concrete, like a sharp editor in the margin. Ask what a scene is for when it is unclear. Offer options ("three ways this argument could turn") rather than one answer.
- Whenever you refer to a passage, a note, a page, an alert or a change, write a Markdown link to it so the author can click through: [words](ck:scene/<scene id>?q=<exact quote, URL-encoded>), add &f=notes for the notes file, [words](ck:page/<page name>?q=...), [words](ck:chapter/<chapter id>), [words](ck:alert/<id>), [words](ck:change/<id>). Tool results give you ready links for what you just made.
- Use the same words for marks the app uses: unreviewed, updated, suggested, conflict.
- Never imitate the author's style in chat; save that for the writer.`

const HELP_LEVEL: Record<string, string> = {
  quiet: 'This author is experienced and wants little unprompted help. Answer what they ask; volunteer only clear problems.',
  some: 'Volunteer help now and then when it clearly matters: what could happen next, texture and staging, connections to arcs, craft opportunities.',
  lots: 'This author wants a lot of help while blocking. Volunteer what could happen next, texture and staging ("they could have this conversation at a café"), how the scene connects to arcs and later chapters, and craft opportunities such as echoing the theme or planting a callback.'
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
  /** Hashes of each document's text as last seen by the planner. */
  seen: Map<string, string>
}

let session: Session | null = null
let running: AbortController | null = null
let queue: Promise<void> = Promise.resolve()

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

async function docTexts(): Promise<Map<string, string>> {
  const b = requireBook()
  const out = new Map<string, string>()
  for (const s of await b.scenes()) {
    out.set(`scene ${s.id} notes`, hash(s.notes ?? ''))
    out.set(`scene ${s.id} prose`, hash(s.prose ?? ''))
  }
  for (const p of PAGES) out.set(`page ${p}`, hash(await b.readPage(p)))
  const tree = await b.tree()
  for (const c of tree.chapters) out.set(`chapter ${c.id}`, hash((await b.readText(`${c.id}/chapter.md`)) ?? ''))
  return out
}

export function resetPlanner(): void {
  running?.abort()
  session = null
}

async function startSession(): Promise<Session> {
  const settings = await loadSettings()
  const recent = (await chatStore.read()).filter((e) => e.role !== 'activity').slice(-30)
  const transcript = recent.length
    ? `<earlier_conversation>\nThe last part of your conversation with the author before this session began:\n${recent.map((e) => `${e.role === 'author' ? 'Author' : 'Claude'}${e.place ? ` (on ${e.place.label})` : ''}: ${e.text}`).join('\n')}\n</earlier_conversation>`
    : ''
  const system: SystemBlocks = [
    { type: 'text', text: `${PLANNER_INSTRUCTIONS}\n\n${HELP_LEVEL[settings.blockingHelp] ?? HELP_LEVEL.some}`, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: (await bookSnapshot()) + (transcript ? `\n\n${transcript}` : ''), cache_control: { type: 'ephemeral', ttl: '1h' } }
  ]
  return { system, messages: [], seen: await docTexts() }
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

async function changedSince(s: Session): Promise<string[]> {
  const now = await docTexts()
  const changed: string[] = []
  for (const [k, h] of now) if (s.seen.get(k) !== h) changed.push(k)
  s.seen = now
  return changed
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
  await pushEntries((e) => [...e, authorEntry, { id: replyId, role: 'claude', text: '', at: new Date().toISOString(), streaming: true }])

  const ctrl = new AbortController()
  running = ctrl
  let reply = ''
  const flush = (streaming: boolean, error = false): Promise<ChatEntry[]> =>
    pushEntries((e) => e.map((x) => (x.id === replyId ? { ...x, text: reply, streaming, error } : x)))
  let lastFlush = 0

  try {
    if (!session || session.messages.length > 120) session = await startSession()
    const s = session
    const changed = await changedSince(s)
    const passageXml = passages.length
      ? `<attached_passages>\n${passages.map((p) => `<passage doc="${p.ref.kind === 'scene' ? `${p.ref.sceneId} ${p.ref.file}` : p.ref.kind === 'page' ? p.ref.name : p.ref.chapterId}">${p.quote}</passage>`).join('\n')}\n</attached_passages>`
      : ''
    const content: BetaContentBlockParam[] = [
      {
        type: 'text',
        text: [
          `<event type="${passages.length ? 'comment' : 'chat'}" at="${authorEntry.at}">`,
          placeXml(place),
          changed.length ? `<changed_since_you_last_heard>\n${changed.join('\n')}\n</changed_since_you_last_heard>` : '',
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
          if (out.activity) await pushEntries((e) => [...e.filter((x) => x.id !== replyId), { id: newId('a'), role: 'activity', text: out.activity!, at: new Date().toISOString() }, ...e.filter((x) => x.id === replyId)])
        } catch (err) {
          if (isAbort(err)) throw err
          results.push({ type: 'tool_result', tool_use_id: u.id, content: err instanceof Error ? err.message : String(err), is_error: true })
        }
      }
      s.messages.push({ role: 'user', content: results })
    }
    await flush(false)
  } catch (err) {
    if (isAbort(err)) {
      reply += reply ? ' …' : '(stopped)'
      // An aborted turn leaves the session mid-thought; start fresh next time.
      session = null
      await flush(false)
    } else {
      reply = reply ? `${reply}\n\n${describeError(err)}` : describeError(err)
      session = null
      await flush(false, true)
    }
  } finally {
    running = null
  }
}
