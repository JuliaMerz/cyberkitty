// The writer lane: every sentence meant for the book. Drafts from notes,
// alternatives, span rewrites and ghost text. The planner never writes prose;
// it hands the writer a brief.

import {
  ALTERNATIVES_SCHEMA,
  buildAlternativesPrompt,
  buildGhostPrompt,
  buildRewritePrompt,
  buildWriterPrompt,
  HUMANIZE,
  writerSystem
} from '@shared/prompts'
import { cleanDraft, missingPinned, pinnedLines } from '@shared/notes'
import type { AlternativesRequest, DraftRequest, DraftResult, LaneSetting, RewriteRequest } from '@shared/types'
import { describeError, RefusedError, streamText, structured } from './gateway'
import { loadSettings } from './settings'
import { requireBook } from './state'
import { recentCorrections } from './stores'
import { stripHeading } from './project'

async function styleAndCorrections(): Promise<{ style: string | null; corrections: Array<{ before: string; after: string }> }> {
  const b = requireBook()
  return { style: await b.readText('style.md'), corrections: await recentCorrections(10) }
}

export async function chapterSoFar(sceneId: string): Promise<Array<{ title: string; prose: string }>> {
  const scenes = await requireBook().scenes()
  const me = scenes.find((s) => s.id === sceneId)
  const out: Array<{ title: string; prose: string }> = []
  for (const s of scenes.filter((x) => x.chapterId === me?.chapterId)) {
    if (s.id === sceneId) break
    if (s.prose?.trim()) out.push({ title: s.title, prose: stripHeading(s.prose) })
  }
  return out
}

export async function runDraft(
  req: DraftRequest,
  lane: LaneSetting,
  signal: AbortSignal,
  onText: (delta: string) => void,
  brief?: string
): Promise<DraftResult & { text?: string }> {
  try {
    const b = requireBook()
    const scene = (await b.scenes()).find((s) => s.id === req.sceneId)
    const notes = scene?.notes ?? ''
    const pinned = pinnedLines(req.beats?.trim() ? req.beats : notes)
    const { style, corrections } = await styleAndCorrections()
    const prompt = buildWriterPrompt({
      bookTitle: await b.title(),
      styleMd: style,
      chapterSoFar: await chapterSoFar(req.sceneId),
      sceneTitle: scene?.title ?? '',
      notes: brief ? `${notes}\n\n<planner_brief>\n${brief}\n</planner_brief>` : notes,
      beats: req.beats,
      proseBefore: req.proseBefore,
      proseAfter: req.proseAfter,
      pinned,
      corrections
    })

    // The reply is cleaned before it reaches the page, so hold back a possible
    // leading heading until the first paragraph is complete.
    let buffered = ''
    let released = false
    const res = await streamText({
      lane,
      system: prompt.system,
      user: prompt.user,
      maxTokens: 32000,
      signal,
      onText: (delta) => {
        if (released) return onText(delta)
        buffered += delta
        if (/\n\s*\n/.test(buffered) || buffered.length > 400) {
          released = true
          const cleaned = buffered.replace(/^\s*#{1,6}\s+[^\n]*\n+/, '').replace(/^\s+/, '')
          if (cleaned) onText(cleaned)
        }
      }
    })
    if (!released && buffered) onText(cleanDraft(buffered))
    if (res.refused) return { ok: false, refused: true, model: res.model, costUsd: res.costUsd, error: new RefusedError().message }
    const text = cleanDraft(res.text)
    return { ok: true, model: res.model, costUsd: res.costUsd, text, missingPinned: missingPinned(pinned, text) }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

export async function alternatives(req: AlternativesRequest): Promise<string[]> {
  const { style, corrections } = await styleAndCorrections()
  const lane = (await loadSettings()).lanes.writerQuick
  const res = await structured<{ alternatives: string[] }>({
    lane,
    system: writerSystem(style, corrections),
    user: buildAlternativesPrompt(req),
    schema: ALTERNATIVES_SCHEMA,
    maxTokens: 4000,
    fakeKey: 'alternatives'
  })
  return res.alternatives.map((a) => a.trim()).filter((a) => a && a !== req.sentence.trim()).slice(0, 4)
}

export async function rewrite(req: RewriteRequest & { brief?: string }, laneName: 'writer' | 'writerQuick' = 'writerQuick'): Promise<string> {
  const { style, corrections } = await styleAndCorrections()
  const lane = (await loadSettings()).lanes[laneName]
  const instruction = req.tool ? HUMANIZE[req.tool] : req.instruction ?? 'Improve it, staying in the author’s voice.'
  const res = await streamText({
    lane,
    system: writerSystem(style, corrections),
    user: buildRewritePrompt({ context: req.context, span: req.quote, instruction, brief: req.brief }),
    maxTokens: 8000
  })
  if (res.refused) throw new RefusedError()
  return res.text.trim().replace(/^["“](.*)["”]$/s, (m, inner: string) => (req.quote.trim().startsWith('"') || req.quote.trim().startsWith('“') ? m : inner))
}

export async function ghostText(sceneId: string, before: string): Promise<string> {
  const b = requireBook()
  const scene = (await b.scenes()).find((s) => s.id === sceneId)
  const { style } = await styleAndCorrections()
  const lane = (await loadSettings()).lanes.quick
  const res = await streamText({ lane, system: writerSystem(style), user: buildGhostPrompt(before, scene?.notes ?? ''), maxTokens: 300 })
  const line = res.text.replace(/\n[\s\S]*$/, '')
  return /^\s/.test(line) || /\s$/.test(before) ? line : ` ${line}`
}
