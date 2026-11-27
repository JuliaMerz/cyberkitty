// The consistency scan: when the author leaves a chapter, goes quiet for a
// while, or presses "scan now", Claude reads the whole book once and files
// what no longer fits. It never runs per edit, and only when the text changed
// since the last scan. Every finding must quote both sides word for word, and
// the app checks the quotes exist before showing anything.

import { jobSystem } from '@shared/briefing'
import { createHash } from 'node:crypto'
import type { DocRef, PageName, SceneFile } from '@shared/types'
import { manuscriptText } from './context'
import { bookContextFor } from './snapshot'
import { describeError, structured } from './gateway'
import { fileAlert, refreshAlerts } from './alerts'
import { loadSettings } from './settings'
import { job, requireBook } from './state'
import { alertStore, correctionCount, recentCorrections } from './stores'
import { countWords } from './project'

const SCAN_SYSTEM = `You are the continuity editor for a novel being written in CyberKitty. Read the whole book and report what no longer fits. Precision matters far more than recall: a list full of false alarms teaches the author to ignore it. Report only real problems, each with both sides quoted exactly, word for word, from the documents named.

Look for:
- continuity: facts that contradict each other, such as a scar that changes hands, or a secret someone could not yet know.
- timeline: impossibilities of time or place, such as a character in two places at once.
- direction: scenes that no longer match a direction page (summary, theme, characters and arcs).
- thread: lower priority. Threads set up and never paid off, only when the book looks far enough along for it to matter.

Do not report style, pacing, or matters of taste. Do not report anything listed as dismissed.

The snapshot ends with the conversation between the author and the planner, and the changes carry any chat since, so you can see what the author has said they intend (a deliberate contradiction, an unreliable narrator, a timeline told out of order).`

const SIDE = {
  type: 'object',
  properties: {
    scene_id: { type: 'string', description: 'The scene id, when the quote is from a scene. Empty otherwise.' },
    file: { type: 'string', enum: ['prose', 'notes', ''] },
    page: { type: 'string', description: 'The page name, e.g. characters.md, when the quote is from a direction page or the bible. Empty otherwise.' },
    quote: { type: 'string' }
  },
  required: ['scene_id', 'file', 'page', 'quote'],
  additionalProperties: false
}

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['continuity', 'timeline', 'direction', 'thread'] },
          title: { type: 'string', description: 'A short headline.' },
          explanation: { type: 'string', description: 'One line on why the two disagree.' },
          fix: { type: 'string', description: 'A suggested fix, in words.' },
          side_a: SIDE,
          side_b: SIDE
        },
        required: ['kind', 'title', 'explanation', 'fix', 'side_a', 'side_b'],
        additionalProperties: false
      }
    }
  },
  required: ['findings'],
  additionalProperties: false
}

type Side = { scene_id: string; file: string; page: string; quote: string }

function toRef(s: Side): DocRef | null {
  if (s.scene_id) return { kind: 'scene', sceneId: s.scene_id, file: (s.file === 'notes' ? 'notes' : 'prose') as SceneFile }
  if (s.page) return { kind: 'page', name: s.page as PageName }
  return null
}

let running = false

export async function scan(opts: { force?: boolean } = {}): Promise<void> {
  if (running) return
  running = true
  const b = requireBook()
  try {
    const manuscript = await manuscriptText({ notes: false })
    const hash = createHash('sha1').update(manuscript).digest('hex')
    const meta = await b.readJson<{ lastHash?: string; at?: string }>('scan.json', {})
    if (!opts.force && meta.lastHash === hash) return
    if (countWords(manuscript) < 200 && !opts.force) return
    job({ id: 'scan', label: 'Reading the whole book for inconsistencies', state: 'running' })
    const dismissed = (await alertStore.read()).filter((a) => a.status === 'dismissed' && a.sides.length)
    const dismissedXml = dismissed.length
      ? `<dismissed>\n${dismissed.map((a) => `- ${a.title}: ${a.sides.map((s) => `“${s.quote}”`).join(' vs ')}`).join('\n')}\n</dismissed>`
      : ''
    // Scans come ten minutes or more apart, so the book rides in a frozen
    // snapshot cached for an hour, and only what changed since is sent fresh.
    const book = await bookContextFor('scan', { style: false, notes: false, conversation: true })
    const res = await structured<{ findings: Array<{ kind: 'continuity' | 'timeline' | 'direction' | 'thread'; title: string; explanation: string; fix: string; side_a: Side; side_b: Side }> }>({
      lane: (await loadSettings()).lanes.background,
      system: [...jobSystem(SCAN_SYSTEM), { type: 'text', text: book.snapshot, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      user: `${book.changes}\n\n${dismissedXml}\n\n<task>List the findings. Where a document appears both in the snapshot and in the changes, only its current text counts.</task>`,
      schema: SCAN_SCHEMA,
      maxTokens: 32000,
      background: true,
      fakeKey: 'scan'
    })
    let filed = 0
    for (const f of res.findings) {
      const a = toRef(f.side_a)
      const bRef = toRef(f.side_b)
      if (!a || !bRef) continue
      const alert = await fileAlert({ kind: f.kind, title: f.title, explanation: f.explanation, fix: f.fix, sides: [{ ref: a, quote: f.side_a.quote }, { ref: bRef, quote: f.side_b.quote }] })
      if (alert) filed++
    }
    await refreshAlerts()
    await proposeStyleSample()
    await b.writeJson('scan.json', { lastHash: hash, at: new Date().toISOString() })
    job({ id: 'scan', label: filed ? `Scan filed ${filed} alert${filed === 1 ? '' : 's'}` : 'Scan found nothing new', state: 'done' })
  } catch (err) {
    job({ id: 'scan', label: 'The scan did not finish', state: 'error', detail: describeError(err) })
  } finally {
    running = false
  }
}

/**
 * Proposed style samples: passages the author typed or heavily rewrote, raised
 * sparingly and only while the style page is thin. Untouched Claude prose is
 * never proposed, so the style cannot drift toward Claude's voice.
 */
async function proposeStyleSample(): Promise<void> {
  const b = requireBook()
  const style = await b.readPage('style.md')
  const samples = /##\s*Samples([\s\S]*?)(?=\n##\s|$)/i.exec(style)?.[1] ?? ''
  if (countWords(samples) > 3000) return
  const open = (await alertStore.read()).some((a) => a.kind === 'style-sample' && a.status === 'open')
  if (open || (await correctionCount()) < 5) return
  const candidates = (await recentCorrections(40)).filter((c) => countWords(c.after) >= 40 && c.sceneId)
  const pick = candidates.at(-1)
  if (!pick || !pick.sceneId) return
  const ref: DocRef = { kind: 'scene', sceneId: pick.sceneId, file: 'prose' }
  await fileAlert({
    kind: 'style-sample',
    title: 'A passage in your own words could join the style page',
    explanation: 'You rewrote this passage heavily. Adding it to the samples helps Claude match you.',
    sides: [{ ref, quote: pick.after.trim() }]
  })
}
