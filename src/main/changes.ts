// Chapter-scale changes: conversation, then a change spec the author edits and
// approves, then the writer rewrites against a working copy, then the author
// reviews each scene's changes in place. The manuscript is untouched until the
// merge, and the book is snapshotted before and after, so the whole change is
// one undo.

import { jobSystem } from '@shared/briefing'
import { makeAnchor } from '@shared/anchors'
import { correctionsXml, withHistory, writerSystem } from '@shared/prompts'
import { cleanDraft } from '@shared/notes'
import type { ChangeSpec, HunkDecision, MarkRecord } from '@shared/types'
import { currentBookText, writerBookContext } from './snapshot'
import { openAlertsText } from './context'
import { describeError, RefusedError, streamText, structured } from './gateway'
import { loadSettings } from './settings'
import { job, newId, requireBook, send, state, writeDoc, addMarks } from './state'
import { changeStore, recentCorrections } from './stores'
import { chapterSoFar } from './writer'
import { stripHeading } from './project'
import { fileAlert } from './alerts'

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for the change.' },
    spec: {
      type: 'string',
      description:
        'The change spec in Markdown, with sections: ## Goal, ## Scene by scene (one bullet per scene that changes, naming it), ## Must not change, ## Effects elsewhere (later chapters and bible entries).'
    },
    scenes: { type: 'array', items: { type: 'string' }, description: 'Ids of the scenes the change rewrites.' },
    effects: {
      type: 'array',
      description: 'Effects outside the rewritten scenes that the author will need to handle.',
      items: {
        type: 'object',
        properties: { scene_id: { type: 'string' }, quote: { type: 'string' }, note: { type: 'string' } },
        required: ['scene_id', 'quote', 'note'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'spec', 'scenes', 'effects'],
  additionalProperties: false
}

export async function proposeChange(chapterId: string, request: string): Promise<ChangeSpec> {
  const b = requireBook()
  const tree = await b.tree()
  const chapter = tree.chapters.find((c) => c.id === chapterId)
  if (!chapter) throw new Error(`No chapter ${chapterId}`)
  const lane = { ...(await loadSettings()).lanes.planner, effort: 'high' as const }
  const res = await structured<{ title: string; spec: string; scenes: string[]; effects: Array<{ scene_id: string; quote: string; note: string }> }>({
    lane,
    system: jobSystem('You write change specs for a novel in CyberKitty. A change spec is short and concrete. It names what changes, scene by scene, and what must not change. It never contains prose for the book; the writer writes that from the spec.'),
    user: `${await currentBookText()}\n\n${await openAlertsText()}\n\n<chapter id="${chapterId}" title="${chapter.title}" />\n\n<request>\n${request}\n</request>`,
    schema: SPEC_SCHEMA,
    fakeKey: 'change'
  })
  const ids = res.scenes.filter((id) => chapter.scenes.some((s) => s.id === id))
  const scenes = (ids.length ? chapter.scenes.filter((s) => ids.includes(s.id)) : chapter.scenes.filter((s) => s.hasProse)).map((s) => ({
    sceneId: s.id,
    title: s.title,
    original: '',
    rewritten: null,
    status: 'pending' as const
  }))
  const change: ChangeSpec = {
    id: newId('ch'),
    chapterId,
    title: res.title,
    spec: res.spec + (res.effects?.length ? `\n\n## Effects to handle after\n\n${res.effects.map((e) => `- ${e.scene_id}: ${e.note} (“${e.quote}”)`).join('\n')}\n` : ''),
    status: 'draft',
    scenes,
    createdAt: new Date().toISOString()
  }
  await changeStore.update((all) => [...all, change])
  return change
}

export async function saveChange(change: ChangeSpec): Promise<void> {
  await changeStore.update((all) => all.map((c) => (c.id === change.id ? change : c)))
}

async function patch(id: string, fn: (c: ChangeSpec) => ChangeSpec): Promise<ChangeSpec> {
  let out: ChangeSpec | undefined
  await changeStore.update((all) =>
    all.map((c) => {
      if (c.id !== id) return c
      out = fn(c)
      return out
    })
  )
  if (!out) throw new Error('No such change.')
  return out
}

/** The writer rewrites each scene against a working copy. */
export async function runChange(id: string): Promise<void> {
  const b = requireBook()
  const change = await patch(id, (c) => ({ ...c, status: 'rewriting' }))
  const style = await b.readText('style.md')
  const corrections = await recentCorrections(10)
  const lane = (await loadSettings()).lanes.writer
  // One book context for the whole run: the manuscript does not change until
  // the merge, so every scene's call shares the same cached prefix.
  const bookContext = await writerBookContext()
  job({ id: `change-${id}`, label: `Rewriting for “${change.title}”`, state: 'running' })
  for (const sc of change.scenes) {
    const scene = (await b.scenes()).find((s) => s.id === sc.sceneId)
    const original = scene?.prose ?? ''
    await patch(id, (c) => ({ ...c, scenes: c.scenes.map((x) => (x.sceneId === sc.sceneId ? { ...x, original, status: 'writing' } : x)) }))
    try {
      const before = await chapterSoFar(sc.sceneId)
      const res = await streamText({
        lane,
        system: writerSystem(style, bookContext.snapshot),
        user: withHistory(bookContext.history, [
          correctionsXml(corrections),
          before.length ? `<chapter_so_far>\n${before.map((s) => `<scene title="${s.title}">\n${s.prose}\n</scene>`).join('\n')}\n</chapter_so_far>` : '',
          `<change_spec>\n${change.spec}\n</change_spec>`,
          scene?.notes ? `<scene_notes>\n${stripHeading(scene.notes)}\n</scene_notes>` : '',
          `<scene_prose title="${sc.title}">\n${stripHeading(original)}\n</scene_prose>`,
          '<task>\nRewrite this scene as the change spec says, and change nothing the spec does not ask for: keep every paragraph that does not need to change exactly as it is, word for word. Reply with the whole scene prose only, with no heading and no commentary.\n</task>'
        ]
          .filter(Boolean)
          .join('\n\n')),
        maxTokens: 32000
      })
      if (res.refused) throw new RefusedError()
      const heading = /^\s*#\s+[^\n]*\n*/.exec(original)?.[0] ?? `# ${sc.title}\n\n`
      const rewritten = heading + cleanDraft(res.text) + '\n'
      await patch(id, (c) => ({ ...c, scenes: c.scenes.map((x) => (x.sceneId === sc.sceneId ? { ...x, rewritten, status: 'ready' } : x)) }))
    } catch (err) {
      await patch(id, (c) => ({ ...c, scenes: c.scenes.map((x) => (x.sceneId === sc.sceneId ? { ...x, status: 'error', error: describeError(err) } : x)) }))
    }
  }
  await patch(id, (c) => ({ ...c, status: 'review' }))
  job({ id: `change-${id}`, label: `Rewrite ready to review: “${change.title}”`, state: 'done' })
}

/**
 * Merge the author's choices. Paragraphs accepted one by one count as
 * reviewed. Through "accept all", a paragraph that rewrites one the author
 * had lands as updated (with the version it replaced); a new one lands as
 * unreviewed.
 */
export async function mergeChange(id: string, decisions: HunkDecision[]): Promise<void> {
  const b = requireBook()
  const change = (await changeStore.read()).find((c) => c.id === id)
  if (!change) throw new Error('No such change.')
  const beforeOid = (await state.history?.snapshot(`Before change: ${change.title}`)) ?? undefined
  for (const d of decisions) {
    const ref = { kind: 'scene' as const, sceneId: d.sceneId, file: 'prose' as const }
    await writeDoc(ref, d.text)
    const at = new Date().toISOString()
    const marks: MarkRecord[] = []
    for (const p of d.updatedParagraphs) {
      const i = d.text.indexOf(p.text)
      if (i < 0) continue
      marks.push({ id: newId('u'), kind: 'updated', file: 'prose', anchor: makeAnchor(d.text, i, i + p.text.length), origin: { source: 'change', note: change.title, at }, acceptedText: p.was })
    }
    // A paragraph with no earlier version was never accepted, so it is plain unreviewed.
    for (const p of d.newParagraphs) {
      const i = d.text.indexOf(p)
      if (i < 0) continue
      marks.push({ id: newId('u'), kind: 'unreviewed', file: 'prose', anchor: makeAnchor(d.text, i, i + p.length), origin: { source: 'change', note: change.title, at } })
    }
    await addMarks(ref, marks)
  }
  // Effects the spec named but did not rewrite become alerts.
  for (const m of change.spec.matchAll(/^- (manuscript\/[^:]+): (.+?) \(“(.+)”\)$/gm)) {
    await fileAlert({ kind: 'direction', title: `After “${change.title}”`, explanation: m[2], sides: [{ ref: { kind: 'scene', sceneId: m[1], file: 'prose' }, quote: m[3] }] })
  }
  await state.history?.snapshot(`Merged change: ${change.title}`)
  await patch(id, (c) => ({ ...c, status: 'merged', beforeOid: beforeOid ?? c.beforeOid, scenes: c.scenes.map((s) => ({ ...s, status: 'merged' })) }))
  send('book-dirty')
}

export async function undoChange(id: string): Promise<void> {
  const change = (await changeStore.read()).find((c) => c.id === id)
  if (!change || change.status !== 'merged') return
  for (const s of change.scenes) {
    if (s.original) await writeDoc({ kind: 'scene', sceneId: s.sceneId, file: 'prose' }, s.original)
  }
  await state.history?.snapshot(`Undid change: ${change.title}`)
  await patch(id, (c) => ({ ...c, status: 'discarded' }))
  send('book-dirty')
}
