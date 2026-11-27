// Settling: when the author pauses or moves on, Claude catches up in the
// background. It rewrites changed scene summaries, updates the bible from the
// text, notices outline entries the writing has left behind, and rereads
// scenes written before a direction page changed. None of it asks for
// approval, and it runs only for text that changed since last time.

import { jobSystem } from '@shared/briefing'
import { createHash } from 'node:crypto'
import { linkFor } from '@shared/links'
import { DIRECTION_PAGES, type DocRef, type PageName, type SceneSummary } from '@shared/types'
import { describeError, structured } from './gateway'
import { bibleText, directionText } from './context'
import { mergeSceneEntries, type ExtractedEntry } from './bible'
import { fileAlert, refreshAlerts } from './alerts'
import { loadSettings } from './settings'
import { job, requireBook } from './state'
import { bibleStore, summaryStore } from './stores'
import { locate, suggest } from './suggest'
import { stripHeading } from './project'

const SETTLE_SYSTEM = `You keep the story bible and scene summaries for a novel the author is writing in CyberKitty. Read the scene and report only what its text actually says. Do not invent or infer beyond the text. The text is the authority.`

const SETTLE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two to four plain sentences: what happens in the scene and what changes.' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['character', 'event', 'movement', 'place', 'world'] },
          subject: { type: 'string', description: 'Who or what the fact is about, by name.' },
          text: { type: 'string', description: 'The fact, in one short sentence.' },
          story_time: { type: 'string', description: 'Loose story time if the text gives one, e.g. "day 1, dusk". Empty if unknown.' },
          order: { type: 'number', description: 'For events and movements: a number placing it in story time relative to the other events you know of; larger is later.' },
          quote: { type: 'string', description: 'The exact words of the scene that establish it, copied verbatim, at most two sentences.' },
          from: { type: 'string', description: 'For movements: the place left.' },
          to: { type: 'string', description: 'For movements: the place reached.' }
        },
        required: ['type', 'subject', 'text', 'story_time', 'order', 'quote', 'from', 'to'],
        additionalProperties: false
      }
    }
  },
  required: ['summary', 'entries'],
  additionalProperties: false
}

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

function sentences(s: string): string[] {
  return s.match(/[^.!?]+[.!?]+["”’)]*\s*/g)?.map((x) => x.trim()) ?? (s.trim() ? [s.trim()] : [])
}

let running = false

export async function settle(): Promise<void> {
  if (running) return
  running = true
  try {
    await settleScenes()
    await checkDirectionChanges()
    await refreshAlerts()
  } finally {
    running = false
  }
}

async function settleScenes(): Promise<void> {
  const b = requireBook()
  const summaries = await summaryStore.read()
  const scenes = (await b.scenes()).filter((s) => s.prose && stripHeading(s.prose).trim())
  const todo = scenes.filter((s) => summaries[s.id]?.hash !== hash(s.prose!))
  if (!todo.length) return
  const lane = { ...(await loadSettings()).lanes.planner, effort: 'low' as const }
  let changedChapters = new Set<string>()
  for (const s of todo) {
    job({ id: `settle-${s.id}`, label: `Catching up on ${s.title}`, state: 'running' })
    try {
      const prose = stripHeading(s.prose!)
      const res = await structured<{ summary: string; entries: ExtractedEntry[] }>({
        lane,
        system: jobSystem(SETTLE_SYSTEM),
        user: `${await bibleText()}\n\n<scene id="${s.id}" title="${s.title}">\n<prose>\n${prose}\n</prose>\n</scene>\n\n<task>Summarise the scene, and list the facts it establishes: character facts, events with their story time, movements between places, places, and world rules or objects. Quote each one exactly. Keep subjects consistent with names already in the bible.</task>`,
        schema: SETTLE_SCHEMA,
        background: true,
        fakeKey: 'settle'
      })
      // Precision: keep only facts whose quote is really in the scene.
      const verified = res.entries
        .map((e) => {
          const at = locate(prose, e.quote)
          return at ? { ...e, quote: prose.slice(at.from, at.to) } : null
        })
        .filter((e): e is ExtractedEntry => e !== null)
      await bibleStore.update((all) => mergeSceneEntries(all, s.id, verified))
      const prev = summaries[s.id]
      const oldSet = new Set(prev ? sentences(prev.text) : [])
      const next: SceneSummary = {
        sceneId: s.id,
        text: res.summary.trim(),
        changed: prev ? sentences(res.summary).filter((x) => !oldSet.has(x)) : [],
        hash: hash(s.prose!),
        at: new Date().toISOString()
      }
      await summaryStore.update((all) => ({ ...all, [s.id]: next }))
      changedChapters.add(s.chapterId)
      job({ id: `settle-${s.id}`, label: `Caught up on ${s.title}`, state: 'done' })
    } catch (err) {
      job({ id: `settle-${s.id}`, label: `Could not catch up on ${s.title}`, state: 'error', detail: describeError(err) })
      return
    }
  }
  for (const c of changedChapters) await checkOutline(c)
  changedChapters = new Set()
}

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    diverged: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          outline_quote: { type: 'string', description: 'The exact outline line the chapter no longer matches.' },
          reason: { type: 'string' },
          replacement: { type: 'string', description: 'The outline line rewritten to match what was written, in the outline’s own style.' },
          later_quotes: { type: 'array', items: { type: 'string' }, description: 'Exact later outline lines that leaned on the old version.' }
        },
        required: ['outline_quote', 'reason', 'replacement', 'later_quotes'],
        additionalProperties: false
      }
    }
  },
  required: ['diverged'],
  additionalProperties: false
}

/** When a chapter ends somewhere the outline did not plan, mark the entry diverged. */
async function checkOutline(chapterId: string): Promise<void> {
  const b = requireBook()
  const outline = await b.readPage('outline.md')
  if (stripHeading(outline).trim().length < 10) return
  const tree = await b.tree()
  const chapter = tree.chapters.find((c) => c.id === chapterId)
  if (!chapter) return
  const summaries = await summaryStore.read()
  const sums = chapter.scenes.map((s) => (summaries[s.id] ? `- ${s.title}: ${summaries[s.id].text}` : '')).filter(Boolean)
  if (!sums.length) return
  try {
    const res = await structured<{ diverged: Array<{ outline_quote: string; reason: string; replacement: string; later_quotes: string[] }> }>({
      lane: { ...(await loadSettings()).lanes.planner, effort: 'low' },
      system: jobSystem('You compare a novel’s outline with what was actually written. A stale outline is normal; report only clear divergences, never small differences of detail.'),
      user: `<outline>\n${outline}\n</outline>\n\n<chapter number="${chapter.number}" title="${chapter.title}">\n${sums.join('\n')}\n</chapter>\n\n<task>Does the outline entry for this chapter still describe what was written? List only entries this chapter clearly departs from.</task>`,
      schema: OUTLINE_SCHEMA,
      background: true,
      fakeKey: 'outline-check'
    })
    const ref: DocRef = { kind: 'page', name: 'outline.md' }
    for (const d of res.diverged) {
      const at = locate(outline, d.outline_quote)
      if (!at) continue
      const quote = outline.slice(at.from, at.to)
      const alert = await fileAlert({
        kind: 'diverged',
        title: `Chapter ${chapter.number} went somewhere the outline did not plan`,
        explanation: d.reason,
        fix: `Rewrite the entry to match: “${d.replacement}”. Later entries that leaned on it: ${d.later_quotes.length ? d.later_quotes.map((q) => `“${q}”`).join(', ') : 'none'}.`,
        sides: [{ ref, quote }]
      })
      if (alert) {
        await suggest({ ref, quote, replacement: d.replacement, note: 'diverged: rewritten to match what was written', source: 'scan' })
        for (const later of d.later_quotes) {
          const lat = locate(outline, later)
          if (lat) await fileAlert({ kind: 'direction', title: 'An outline entry leaned on a diverged one', explanation: `It assumed: “${quote}”.`, sides: [{ ref, quote: outline.slice(lat.from, lat.to) }] })
        }
      }
    }
  } catch {
    // Outline checks are a nicety; a failure here never blocks settling.
  }
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scene_id: { type: 'string' },
          fits: { type: 'boolean' },
          reason: { type: 'string' },
          quote: { type: 'string', description: 'Exact words from the scene that no longer fit, if it does not fit; else empty.' }
        },
        required: ['scene_id', 'fits', 'reason', 'quote'],
        additionalProperties: false
      }
    }
  },
  required: ['verdicts'],
  additionalProperties: false
}

/**
 * Down, intent to text: when a direction page changes, scenes written before
 * the change are reread, and each gets a verdict with its reason.
 */
async function checkDirectionChanges(): Promise<void> {
  const b = requireBook()
  const seen = await b.readJson<Record<string, string>>('direction-seen.json', {})
  const now: Record<string, string> = {}
  const changed: Array<{ name: PageName; before: string; after: string }> = []
  for (const p of DIRECTION_PAGES) {
    if (p.name === 'style.md' || p.name === 'outline.md') continue
    const text = await b.readPage(p.name)
    now[p.name] = text
    if (seen[p.name] !== undefined && seen[p.name] !== text && Math.abs(seen[p.name].length - text.length) + diffSize(seen[p.name], text) > 20) {
      changed.push({ name: p.name, before: seen[p.name], after: text })
    }
  }
  await b.writeJson('direction-seen.json', now)
  if (!changed.length) return
  const summaries = await summaryStore.read()
  const written = (await b.scenes()).filter((s) => s.prose && stripHeading(s.prose).trim())
  if (!written.length) return
  try {
    const res = await structured<{ verdicts: Array<{ scene_id: string; fits: boolean; reason: string; quote: string }> }>({
      lane: (await loadSettings()).lanes.planner,
      system: jobSystem('A direction page of the novel changed. For each scene written before the change, say whether it still fits, with a one-sentence reason. Be honest: most scenes usually still fit.'),
      user: `${changed.map((c) => `<changed page="${c.name}">\n<before>\n${c.before}\n</before>\n<after>\n${c.after}\n</after>\n</changed>`).join('\n')}\n\n${await directionText()}\n\n<scenes>\n${written.map((s) => `<scene id="${s.id}" title="${s.title}">\n${summaries[s.id]?.text ?? ''}\n<prose>\n${stripHeading(s.prose!)}\n</prose>\n</scene>`).join('\n')}\n</scenes>`,
      schema: VERDICT_SCHEMA,
      background: true,
      fakeKey: 'verdicts'
    })
    for (const v of res.verdicts ?? []) {
      if (v.fits) continue
      const scene = written.find((s) => s.id === v.scene_id)
      if (!scene) continue
      const ref: DocRef = { kind: 'scene', sceneId: scene.id, file: 'prose' }
      const quote = v.quote && locate(scene.prose!, v.quote) ? v.quote : stripHeading(scene.prose!).trim().split('\n')[0]
      await fileAlert({
        kind: 'written-before',
        title: `${scene.title} was written before ${changed.map((c) => c.name.replace('.md', '')).join(' and ')} changed`,
        explanation: v.reason,
        fix: `Start a change spec for this chapter, or edit it by hand. ${linkFor(ref)}`,
        sides: [{ ref, quote }]
      })
    }
  } catch {
    // A failed verdict pass is retried at the next change.
  }
}

function diffSize(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  let j = 0
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  return Math.max(a.length, b.length) - i - j
}
