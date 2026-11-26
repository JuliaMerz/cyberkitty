import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorSelection } from '@codemirror/state'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { healMarks } from '@shared/anchors'
import type { ChapterRef, DraftResult, MarkKind, MarkRecord, SceneContent, SceneFile, Settings } from '@shared/types'
import { exportMarks, liveMarks, machineEdit, markDraftedParagraphs, marksChanged, setMarks } from '../editor/marks'
import { KeyBar } from './KeyBar'
import { MarkdownEditor } from './MarkdownEditor'

const ck = window.ck

const NOTES_PLACEHOLDER =
  'Start with set and setting: where and when this happens, who is there, what the place is like.\n\nThen the beats, as rough bullets. A line that is only a quotation is pinned: the draft will use it word for word.'

type View = Settings['sceneView']

interface Props {
  sceneId: string
  chapter: ChapterRef | undefined
  view: View
  onViewChange: (v: View) => void
}

interface Notice {
  tone: 'info' | 'warn' | 'error'
  text: string
}

export function ScenePage({ sceneId, chapter, view, onViewChange }: Props): React.JSX.Element {
  const [scene, setScene] = useState<SceneContent | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [, setTick] = useState(0)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [notesSelection, setNotesSelection] = useState('')

  const prose = useRef<EditorView | null>(null)
  const notes = useRef<EditorView | null>(null)
  const proseExists = useRef(false)
  const lastProseCursor = useRef<number | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const draftState = useRef<{ jobId: string; start: number; pos: number } | null>(null)

  const editorFor = (file: SceneFile): EditorView | null => (file === 'prose' ? prose.current : notes.current)

  // Load the scene, and reload it when another scene is opened.
  useEffect(() => {
    let live = true
    setScene(null)
    setNotice(null)
    proseExists.current = false
    lastProseCursor.current = null
    void ck.readScene(sceneId).then((s) => {
      if (!live) return
      proseExists.current = s.prose !== null
      setScene(s)
      setLoadKey((k) => k + 1)
    })
    return () => {
      live = false
      flushSaves()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  const applyMarks = useCallback((file: SceneFile, v: EditorView, records: MarkRecord[]) => {
    const healed = healMarks(v.state.doc.toString(), records.filter((m) => m.file === file))
    v.dispatch({
      effects: setMarks.of(healed.marks.map((record) => ({ record, range: healed.ranges.get(record.id)! }))),
      annotations: machineEdit.of('external')
    })
  }, [])

  const saveSidecar = useCallback(() => {
    const marks: MarkRecord[] = []
    if (prose.current) marks.push(...exportMarks(prose.current.state))
    if (notes.current) marks.push(...exportMarks(notes.current.state))
    void ck.writeSidecar(sceneId, { version: 1, marks })
  }, [sceneId])

  const saveFile = useCallback(
    (file: SceneFile) => {
      const v = editorFor(file)
      if (!v) return
      if (file === 'prose') proseExists.current = true
      void ck.writeSceneFile(sceneId, file, v.state.doc.toString())
    },
    [sceneId]
  )

  function schedule(key: string, fn: () => void, ms: number): void {
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => {
      delete saveTimers.current[key]
      fn()
    }, ms)
  }

  function flushSaves(): void {
    for (const [key, t] of Object.entries(saveTimers.current)) {
      clearTimeout(t)
      if (key === 'prose' || key === 'notes') saveFile(key)
      if (key === 'sidecar') saveSidecar()
    }
    saveTimers.current = {}
  }

  const onUpdate = (file: SceneFile) => (u: ViewUpdate) => {
    const external = u.transactions.some((t) => t.annotation(machineEdit) === 'external')
    if (u.docChanged && !external) {
      schedule(file, () => saveFile(file), 400)
      ck.noteActivity()
    }
    if ((u.docChanged && !external) || marksChanged(u)) {
      schedule('sidecar', saveSidecar, 500)
      setTick((t) => t + 1)
    }
    if (file === 'prose' && (u.selectionSet || u.focusChanged) && u.view.hasFocus) {
      lastProseCursor.current = u.state.selection.main.head
    }
    if (file === 'notes' && (u.selectionSet || u.docChanged)) {
      const sel = u.state.selection.main
      setNotesSelection(sel.empty ? '' : u.state.sliceDoc(sel.from, sel.to))
    }
  }

  // Edits made in another app are picked up, and marks heal against them.
  useEffect(
    () =>
      ck.onFileChanged((e) => {
        if (e.sceneId !== sceneId) return
        const v = editorFor(e.file)
        if (!v || e.text === null || e.text === v.state.doc.toString()) return
        if (draftState.current && e.file === 'prose') return
        const records = exportMarks(v.state)
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: e.text },
          annotations: machineEdit.of('external')
        })
        applyMarks(e.file, v, records)
        if (e.file === 'prose') proseExists.current = true
        setNotice({ tone: 'info', text: `Picked up changes to the ${e.file} made outside CyberKitty.` })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneId]
  )

  // Streamed draft text goes straight into the prose file.
  useEffect(() => {
    const offDelta = ck.onDraftDelta((jobId, text) => {
      const d = draftState.current
      const v = prose.current
      if (!d || d.jobId !== jobId || !v) return
      v.dispatch({
        changes: { from: d.pos, insert: text },
        annotations: machineEdit.of('claude'),
        userEvent: 'claude.draft'
      })
      d.pos += text.length
    })
    const offDone = ck.onDraftDone((jobId, result: DraftResult) => {
      const d = draftState.current
      if (!d || d.jobId !== jobId) return
      draftState.current = null
      setDrafting(null)
      const v = prose.current
      if (v && d.pos > d.start) {
        markDraftedParagraphs(v, d.start, d.pos, 'prose', result.model ? `drafted from notes by ${result.model}` : 'drafted from notes')
        saveFile('prose')
        saveSidecar()
      }
      if (!result.ok) setNotice({ tone: result.refused ? 'warn' : 'error', text: result.error ?? 'The draft failed.' })
      else if (result.missingPinned?.length)
        setNotice({ tone: 'warn', text: `The draft did not use your pinned wording: “${result.missingPinned.join('”, “')}”.` })
      else setNotice(null)
    })
    return () => {
      offDelta()
      offDone()
    }
  }, [saveFile, saveSidecar])

  async function draft(): Promise<void> {
    const v = prose.current
    const n = notes.current
    if (!v || !n || drafting) return
    if (view === 'notes') onViewChange('both')
    let beats = notesSelection.trim() ? notesSelection : undefined
    const doc = v.state.doc

    // Where the prose goes: a bracketed gap under the cursor, the cursor, or the end.
    let at = lastProseCursor.current ?? doc.length
    if (at > doc.length) at = doc.length
    const line = doc.lineAt(at)
    const gap = /^\s*\[([^\]\n]+)\]\s*$/.exec(line.text)
    if (gap && lastProseCursor.current !== null) {
      beats = beats ?? gap[1]
      v.dispatch({ changes: { from: line.from, to: line.to }, annotations: machineEdit.of('claude') })
      at = line.from
    } else if (lastProseCursor.current === null || line.text.trim()) {
      // Start a new paragraph after the line the cursor is on.
      at = lastProseCursor.current === null ? doc.length : line.to
    }
    const before = v.state.doc.sliceString(0, at)
    const sep = before.trim() === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    if (sep) v.dispatch({ changes: { from: at, insert: sep }, annotations: machineEdit.of('claude') })
    at += sep.length
    const after = v.state.doc.sliceString(at)
    if (after.trim() && !after.startsWith('\n\n')) {
      v.dispatch({ changes: { from: at, insert: '\n\n' }, annotations: machineEdit.of('claude') })
    }

    setNotice(null)
    const jobId = await ck.draft({
      sceneId,
      beats,
      proseBefore: v.state.doc.sliceString(0, at),
      proseAfter: v.state.doc.sliceString(at)
    })
    draftState.current = { jobId, start: at, pos: at }
    setDrafting(jobId)
  }

  function stopDraft(): void {
    if (drafting) ck.cancelDraft(drafting)
  }

  // Recomputed on every render; the editors tick a render when marks change.
  const counts: Record<MarkKind, number> = { unreviewed: 0, updated: 0, suggested: 0, conflict: 0 }
  for (const v of [prose.current, notes.current]) {
    if (!v) continue
    for (const m of liveMarks(v.state)) counts[m.record.kind]++
  }

  function step(kind: MarkKind): void {
    const order: EditorView[] = []
    if (view !== 'notes' && prose.current) order.push(prose.current)
    if (view !== 'prose' && notes.current) order.push(notes.current)
    const all = order.flatMap((v) => liveMarks(v.state).filter((m) => m.record.kind === kind).map((m) => ({ v, m })))
    if (!all.length) return
    const focused = order.find((v) => v.hasFocus) ?? order[0]
    const head = focused.state.selection.main.head
    const startIdx = order.indexOf(focused)
    const next =
      all.find(({ v, m }) => (order.indexOf(v) === startIdx && m.from > head) || order.indexOf(v) > startIdx) ?? all[0]
    next.v.focus()
    next.v.dispatch({ selection: EditorSelection.range(next.m.from, next.m.to), scrollIntoView: true })
  }

  if (!scene) return <div className="scene-loading">Opening…</div>

  const proseDoc = scene.prose ?? `# ${scene.title}\n\n`
  const notesDoc = scene.notes ?? ''
  const toReview = counts.unreviewed + counts.updated
  const draftLabel = notesSelection.trim() ? 'Draft selected notes' : 'Draft it'

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          {chapter && <span className="crumb-parent">{chapter.number} · {chapter.title}</span>}
          {chapter && <span className="crumb-sep">/</span>}
          <span className="crumb-current">{scene.title}</span>
        </div>
        <div className="segmented" role="tablist" aria-label="Scene view">
          {(['notes', 'both', 'prose'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => onViewChange(v)}>
              {v === 'notes' ? 'Notes' : v === 'both' ? 'Both' : 'Prose'}
            </button>
          ))}
        </div>
        <div className="header-right">
          {toReview > 0 && (
            <button className="chip chip-blue" onClick={() => step('unreviewed')}>
              {toReview} {toReview === 1 ? 'paragraph' : 'paragraphs'} to review
            </button>
          )}
          {drafting ? (
            <button className="btn" onClick={stopDraft}>
              <span className="pulse" aria-hidden="true" /> Writing… Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void draft()} title="Claude writes prose from your notes, in your style, into the scene file">
              {draftLabel}
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status">
          <span>{notice.text}</span>
          <button className="notice-x" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <div className={`scene-body view-${view}`}>
        <section className="pane pane-notes" aria-label="Notes" hidden={view === 'prose'}>
          <div className="pane-label">
            <span>{sceneId.split('/').pop()}.notes.md</span>
            <span>scratchpad</span>
          </div>
          <MarkdownEditor
            docKey={`${sceneId}:notes:${loadKey}`}
            doc={notesDoc}
            kind="notes"
            placeholder={NOTES_PLACEHOLDER}
            className="editor-host"
            onView={(v) => {
              notes.current = v
              if (v) applyMarks('notes', v, scene.sidecar.marks)
            }}
            onUpdate={onUpdate('notes')}
          />
        </section>
        <section className="pane pane-prose" aria-label="Prose" hidden={view === 'notes'}>
          <div className="pane-label">
            <span>{sceneId.split('/').pop()}.md</span>
            <span>click to type · hover a shade for options</span>
          </div>
          <MarkdownEditor
            docKey={`${sceneId}:prose:${loadKey}`}
            doc={proseDoc}
            kind="prose"
            className="editor-host"
            onView={(v) => {
              prose.current = v
              if (v) applyMarks('prose', v, scene.sidecar.marks)
            }}
            onUpdate={onUpdate('prose')}
          />
        </section>
      </div>

      <KeyBar counts={counts} onStep={step} />
    </main>
  )
}
