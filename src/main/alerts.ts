// Alerts: a todo list in book order. Conflicts, outline divergence, Claude's
// bible ideas, proposed style samples and plain todos all land here. Precision
// matters more than recall: an alert is filed only when every quote it makes
// is found in the text.

import { createHash } from 'node:crypto'
import { makeAnchor } from '@shared/anchors'
import { docKey, type Alert, type AlertKind, type AlertSide, type DocRef, type MarkRecord } from '@shared/types'
import { locate } from './suggest'
import { addMarks, newId, requireBook, send, state } from './state'
import { alertStore } from './stores'

const MARKED: AlertKind[] = ['continuity', 'timeline', 'direction']

function norm(q: string): string {
  return q.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

export function pairKey(kind: AlertKind, sides: Array<{ ref: DocRef; quote: string }>): string {
  const parts = sides.map((s) => `${docKey(s.ref)}|${norm(s.quote)}`).sort()
  return createHash('sha1').update(`${kind}\n${parts.join('\n')}`).digest('hex').slice(0, 16)
}

export async function sideLabel(ref: DocRef): Promise<string> {
  const b = requireBook()
  if (ref.kind === 'page') return ref.name.replace(/\.md$/, '').replace(/^./, (c) => c.toUpperCase())
  if (ref.kind === 'chapter') return (await b.tree()).chapters.find((c) => c.id === ref.chapterId)?.title ?? 'Chapter'
  const s = (await b.scenes()).find((x) => x.id === ref.sceneId)
  return `${s?.title ?? 'Scene'}${ref.file === 'notes' ? ', notes' : ''}`
}

export async function fileAlert(args: {
  kind: AlertKind
  title: string
  explanation: string
  fix?: string
  sides: Array<{ ref: DocRef; quote: string }>
  bibleId?: string
}): Promise<Alert | null> {
  const b = requireBook()
  const sides: AlertSide[] = []
  for (const s of args.sides) {
    const text = (await b.readDoc(s.ref)).text ?? ''
    const at = locate(text, s.quote)
    if (!at) return null
    sides.push({ ref: s.ref, quote: text.slice(at.from, at.to), label: await sideLabel(s.ref) })
  }
  const key = pairKey(args.kind, sides)
  const existing = (await alertStore.read()).find((a) => a.pairKey === key)
  // A dismissal sticks to the exact pair it was about.
  if (existing && existing.status !== 'done') return existing.status === 'dismissed' ? null : existing
  const sceneSide = sides.find((s) => s.ref.kind === 'scene')
  const alert: Alert = {
    id: newId('al'),
    kind: args.kind,
    title: args.title,
    explanation: args.explanation,
    fix: args.fix,
    sides,
    sceneId: sceneSide?.ref.kind === 'scene' ? sceneSide.ref.sceneId : undefined,
    status: 'open',
    pairKey: key,
    bibleId: args.bibleId,
    at: new Date().toISOString()
  }
  await alertStore.update((all) => [...all.filter((a) => a.pairKey !== key), alert])
  if (MARKED.includes(args.kind)) {
    for (const s of sides) {
      if (s.ref.kind !== 'scene') continue
      const text = (await b.readDoc(s.ref)).text ?? ''
      const at = locate(text, s.quote)!
      const rec: MarkRecord = {
        id: newId('k'),
        kind: 'conflict',
        file: s.ref.file,
        anchor: makeAnchor(text, at.from, at.to),
        origin: { source: 'scan', note: args.title, at: alert.at },
        alertId: alert.id
      }
      await addMarks(s.ref, [rec])
    }
  }
  send('book-dirty')
  return alert
}

export async function addTodo(text: string, sceneId?: string): Promise<Alert> {
  const alert: Alert = {
    id: newId('al'),
    kind: 'todo',
    title: text,
    explanation: '',
    sides: [],
    sceneId,
    status: 'open',
    pairKey: newId('todo'),
    at: new Date().toISOString()
  }
  await alertStore.update((all) => [...all, alert])
  send('book-dirty')
  return alert
}

/** Remove the conflict marks an alert put on the text. */
async function clearMarks(alert: Alert): Promise<void> {
  const b = requireBook()
  for (const s of alert.sides) {
    if (s.ref.kind !== 'scene') continue
    const key = docKey(s.ref)
    if (state.openDocs.has(key)) send('marks-removed', { key, alertId: alert.id })
    else {
      const cur = await b.readDoc(s.ref)
      await b.writeDocMarks(s.ref, cur.marks.filter((m) => m.alertId !== alert.id))
    }
  }
}

export async function setAlertStatus(id: string, status: Alert['status']): Promise<void> {
  let target: Alert | undefined
  await alertStore.update((all) =>
    all.map((a) => {
      if (a.id !== id) return a
      target = { ...a, status, statusBy: 'author' }
      return target
    })
  )
  if (target && status !== 'open') await clearMarks(target)
  send('book-dirty')
}

/**
 * Close alerts whose words are gone: the author fixed one side, so the two
 * sides no longer disagree in the way the alert said. Done without a word.
 */
export async function refreshAlerts(): Promise<void> {
  const b = requireBook()
  const all = await alertStore.read()
  const stale: Alert[] = []
  for (const a of all) {
    if (a.status !== 'open' || !a.sides.length) continue
    for (const s of a.sides) {
      const text = (await b.readDoc(s.ref)).text ?? ''
      if (!locate(text, s.quote) || text.indexOf(s.quote) === -1) {
        stale.push(a)
        break
      }
    }
  }
  if (!stale.length) return
  const ids = new Set(stale.map((a) => a.id))
  await alertStore.update((cur) => cur.map((a) => (ids.has(a.id) ? { ...a, status: 'done', statusBy: 'app' } : a)))
  for (const a of stale) await clearMarks(a)
  send('book-dirty')
}

export async function openAlertCount(): Promise<number> {
  return (await alertStore.read()).filter((a) => a.status === 'open').length
}
