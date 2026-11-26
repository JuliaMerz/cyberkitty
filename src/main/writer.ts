// The writer lane: turns a scene's notes into prose in the author's style.

import { buildWriterPrompt } from '@shared/prompts'
import { cleanDraft, missingPinned, pinnedLines } from '@shared/notes'
import type { DraftRequest, DraftResult, LaneSetting } from '@shared/types'
import { describeError, streamText } from './gateway'
import type { Book } from './project'

export async function runDraft(
  book: Book,
  req: DraftRequest,
  lane: LaneSetting,
  signal: AbortSignal,
  onText: (delta: string) => void
): Promise<DraftResult & { text?: string }> {
  try {
    const tree = await book.tree()
    const chapter = tree.chapters.find((c) => c.scenes.some((s) => s.id === req.sceneId))
    const scene = await book.readScene(req.sceneId)
    const chapterSoFar: Array<{ title: string; prose: string }> = []
    for (const s of chapter?.scenes ?? []) {
      if (s.id === req.sceneId) break
      const prose = (await book.readScene(s.id)).prose
      if (prose?.trim()) chapterSoFar.push({ title: s.title, prose: prose.replace(/^\s*#\s+[^\n]*\n*/, '') })
    }
    const notes = scene.notes ?? ''
    const pinned = pinnedLines(req.beats?.trim() ? req.beats : notes)
    const prompt = buildWriterPrompt({
      bookTitle: tree.title,
      styleMd: await book.readText('style.md'),
      chapterSoFar,
      sceneTitle: scene.title,
      notes,
      beats: req.beats,
      proseBefore: req.proseBefore,
      proseAfter: req.proseAfter,
      pinned
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

    if (res.refused) {
      return {
        ok: false,
        refused: true,
        model: res.model,
        costUsd: res.costUsd,
        error: 'Claude declined to write this passage. You can rephrase the notes, or pick another writer model in Settings and try again.'
      }
    }
    const text = cleanDraft(res.text)
    return { ok: true, model: res.model, costUsd: res.costUsd, text, missingPinned: missingPinned(pinned, text) }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}
