// One Markdown document in an editor: a scene's notes or prose, a chapter's
// intent, or a book page. It loads and saves the file, keeps the sidecar's
// marks, takes in marks and edits that arrive from elsewhere, and offers the
// small Claude tools (alternatives, humanize, comment) in place.

import { useEffect, useRef, useState } from 'react'
import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { healMarks, makeAnchor, paragraphs } from '@shared/anchors'
import { docKey, type DocRef, type HumanizeTool, type MarkRecord, type Place } from '@shared/types'
import {
  acceptSuggestion,
  addMarks,
  editorHooks,
  exportMarks,
  liveMarks,
  machineEdit,
  markDraftedParagraphs,
  marksChanged,
  marksField,
  newMarkId,
  removeAlertMarks,
  setMarks,
  touchedByAuthor
} from '../editor/marks'
import { makeState, type EditorKind } from '../editor/setup'
import { derivedMarks, ghostText, reviewWhenSeen, selectionTools, setBan } from '../editor/tools'
import { findQuote, refLabel, registerEditor, useApp } from '../appContext'

const ck = window.ck

interface Props {
  docRef: DocRef
  kind: EditorKind
  /** Shown when the file does not exist yet; not written until the author types. */
  initial?: string
  placeholder?: string
  label?: string
  className?: string
  place: Omit<Place, 'paragraph' | 'selection'>
  reveal?: { quote: string; n: number } | null
  onView?: (view: EditorView | null) => void
  onUpdate?: (u: ViewUpdate) => void
  /** Called after an edit from outside the app was taken in. */
  onExternal?: () => void
}

interface AltState {
  from: number
  to: number
  x: number
  y: number
  options: string[] | null
  error?: string
  /** Set when the alternatives are for a suggestion's proposed words. */
  suggestionId?: string
  /** On updated text: the version the author had accepted, offered first. */
  accepted?: { from: number; to: number; text: string }
}

export function DocEditor(props: Props): React.JSX.Element {
  const { docRef, kind } = props
  const app = useApp()
  const key = docKey(docRef)
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const appRef = useRef(app)
  appRef.current = app
  const [alt, setAlt] = useState<AltState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let view: EditorView | null = null
    let unregister = (): void => undefined
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    let exists = false
    let lastActivity = 0
    const pendingCorrections: Array<{ before: string; pos: number }> = []
    const prose = kind === 'prose'

    // A save that fails says so and tries again; the words stay in the editor meanwhile.
    const failed = (k: string, retry: () => Promise<void>) => (err: unknown): void => {
      if (!live) return
      setSaveError(String(err instanceof Error ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      schedule(k, retry, 3000)
    }
    const save = (): Promise<void> => {
      if (!view) return Promise.resolve()
      exists = true
      return ck.writeDoc(docRef, view.state.doc.toString()).then(() => {
        if (live) setSaveError(null)
      }, failed('text', save))
    }
    const saveMarks = (): Promise<void> => (view ? ck.writeDocMarks(docRef, exportMarks(view.state)).catch(failed('marks', saveMarks)) : Promise.resolve())
    const schedule = (k: string, fn: () => void, ms: number): void => {
      clearTimeout(timers[k])
      timers[k] = setTimeout(() => {
        delete timers[k]
        fn()
      }, ms)
    }
    /** Save whatever is waiting on a timer now; resolves once it is on disk. */
    const flush = (): Promise<void> => {
      const writes: Promise<void>[] = []
      for (const [k, t] of Object.entries(timers)) {
        clearTimeout(t)
        delete timers[k]
        if (k === 'text') writes.push(save())
        if (k === 'marks') writes.push(saveMarks())
        if (k === 'corrections') logCorrections()
      }
      return Promise.all(writes).then(() => undefined)
    }
    const logCorrections = (): void => {
      if (!view) return
      const doc = view.state.doc.toString()
      const paras = paragraphs(doc)
      for (const c of pendingCorrections.splice(0)) {
        const p = paras.find((x) => c.pos >= x.from && c.pos <= x.to)
        if (!p) continue
        ck.logCorrection({ before: c.before, after: doc.slice(p.from, p.to), at: new Date().toISOString(), sceneId: docRef.kind === 'scene' ? docRef.sceneId : undefined })
      }
    }
    const reportPlace = (v: EditorView): void => {
      const sel = v.state.selection.main
      const line = v.state.doc.lineAt(sel.head)
      appRef.current.setPlace({
        ...propsRef.current.place,
        paragraph: line.text.trim() ? line.text.slice(0, 1200) : undefined,
        selection: sel.empty ? undefined : v.state.sliceDoc(sel.from, sel.to).slice(0, 2000)
      })
    }

    const hooks = editorHooks.of({
      attach: (v, from, to) => {
        appRef.current.attach({ ref: docRef, quote: v.state.sliceDoc(from, to), label: refLabel(docRef, appRef.current.sceneTitle) })
      },
      openAlert: (id) => appRef.current.navigate({ kind: 'alerts', id }),
      alternatives: (v, from, to) => {
        const c = v.coordsAtPos(from)
        const box = host.current?.getBoundingClientRect()
        if (!c || !box) return
        const sentence = v.state.sliceDoc(from, to)
        const line = v.state.doc.lineAt(from)
        const mark = liveMarks(v.state).find((m) => m.from <= from && m.to >= to)
        const accepted = mark?.record.kind === 'updated' && mark.record.acceptedText ? { from: mark.from, to: mark.to, text: mark.record.acceptedText } : undefined
        setAlt({ from, to, x: c.left - box.left, y: c.bottom - box.top + 4, options: null, accepted })
        void ck
          .alternatives({ sceneId: docRef.kind === 'scene' ? docRef.sceneId : '', sentence, paragraph: line.text, acceptedText: mark?.record.acceptedText })
          .then((r) => setAlt((a) => (a && a.from === from ? { ...a, options: r.ok ? (r.value ?? []) : [], error: r.ok ? undefined : r.error } : a)))
      },
      suggestionAlternatives: (v, rec, from, to) => {
        const c = v.coordsAtPos(to)
        const box = host.current?.getBoundingClientRect()
        if (!c || !box || rec.replacement === undefined) return
        setAlt({ from, to, x: c.left - box.left, y: c.bottom - box.top + 4, options: null, suggestionId: rec.id })
        const line = v.state.doc.lineAt(from)
        // The paragraph as it would read with the suggestion accepted.
        const paragraph =
          rec.insert === 'after' ? rec.replacement : line.text.slice(0, from - line.from) + rec.replacement + line.text.slice(Math.min(line.length, to - line.from))
        void ck
          .alternatives({ sceneId: docRef.kind === 'scene' ? docRef.sceneId : '', sentence: rec.replacement, paragraph })
          .then((r) => setAlt((a) => (a && a.suggestionId === rec.id ? { ...a, options: r.ok ? (r.value ?? []) : [], error: r.ok ? undefined : r.error } : a)))
      },
      humanize: (v, tool, from, to) => {
        const quote = v.state.sliceDoc(from, to)
        const context = v.state.sliceDoc(Math.max(0, from - 1500), Math.min(v.state.doc.length, to + 1500))
        setBusy('The writer is rewriting the selection…')
        void ck.rewrite({ ref: docRef, quote, context, tool: tool as HumanizeTool }).then((r) => {
          setBusy(r.ok ? null : (r.error ?? 'The rewrite failed.'))
          if (!r.ok || !r.value || !viewRef.current) return
          const cur = viewRef.current
          const at = findQuote(cur.state.doc.toString(), quote)
          if (!at) return
          const record: MarkRecord = {
            id: newMarkId(),
            kind: 'suggested',
            file: docRef.kind === 'scene' ? docRef.file : 'prose',
            anchor: makeAnchor(cur.state.doc.toString(), at.from, at.to),
            origin: { source: 'rewrite', note: tool === 'sample' ? 'like your samples' : tool, at: new Date().toISOString() },
            replacement: r.value
          }
          cur.dispatch({ effects: addMarks.of([{ record, from: at.from, to: at.to }]) })
        })
      }
    })

    const extra: Extension[] = [hooks, derivedMarks(prose), selectionTools(prose)]
    if (prose && app.settings.ghostText && docRef.kind === 'scene') {
      const sceneId = docRef.sceneId
      extra.push(
        ghostText(
          async (before) => {
            const r = await ck.ghostText({ sceneId, before })
            return r.ok ? (r.value ?? null) : null
          },
          (v, from, to) => markDraftedParagraphs(v, from, to, 'prose', 'ghost text')
        )
      )
    }
    if (prose && app.settings.reviewWhenSeen) extra.push(reviewWhenSeen())
    extra.push(
      EditorView.updateListener.of((u) => {
        const external = u.transactions.some((t) => t.annotation(machineEdit) === 'external')
        for (const tr of u.transactions) {
          if (!tr.docChanged || tr.annotation(machineEdit) || tr.isUserEvent('undo') || tr.isUserEvent('redo')) continue
          const ids = touchedByAuthor(tr.startState.field(marksField), tr)
          if (!ids.length) continue
          for (const m of liveMarks(tr.startState)) {
            if (ids.includes(m.record.id)) pendingCorrections.push({ before: tr.startState.sliceDoc(m.from, m.to), pos: tr.changes.mapPos(m.from) })
          }
        }
        if (pendingCorrections.length && u.docChanged) {
          for (const c of pendingCorrections) c.pos = u.changes.mapPos(c.pos)
          schedule('corrections', logCorrections, 4000)
        }
        if (u.docChanged && !external) {
          schedule('text', save, 400)
          if (Date.now() - lastActivity > 2000) {
            lastActivity = Date.now()
            reportPlace(u.view)
            ck.noteActivity({ ...propsRef.current.place, label: propsRef.current.place.label })
          }
        }
        if ((u.docChanged && !external) || marksChanged(u)) schedule('marks', saveMarks, 500)
        if ((u.selectionSet || u.focusChanged) && u.view.hasFocus) reportPlace(u.view)
        if (u.focusChanged && u.view.hasFocus) ck.noteActivity(propsRef.current.place as Place)
        propsRef.current.onUpdate?.(u)
      })
    )

    void ck.readDoc(docRef).then((doc) => {
      if (!live || !host.current) return
      exists = doc.text !== null
      const text = doc.text ?? propsRef.current.initial ?? ''
      view = new EditorView({
        state: makeState(text, kind, { placeholder: propsRef.current.placeholder, extra, label: propsRef.current.label }),
        parent: host.current
      })
      viewRef.current = view
      const healed = healMarks(text, doc.marks)
      view.dispatch({
        effects: [setMarks.of(healed.marks.map((record) => ({ record, range: healed.ranges.get(record.id)! }))), setBan.of(appRef.current.ban)],
        annotations: machineEdit.of('external')
      })
      unregister = registerEditor(docRef, view, flush)
      propsRef.current.onView?.(view)
      setLoaded(true)
    })

    const offFile = ck.onFileChanged((e) => {
      if (e.key !== key || !view || e.text === null || e.text === view.state.doc.toString()) return
      const records = exportMarks(view.state)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: e.text }, annotations: machineEdit.of('external') })
      const healed = healMarks(e.text, records)
      view.dispatch({ effects: setMarks.of(healed.marks.map((record) => ({ record, range: healed.ranges.get(record.id)! }))), annotations: machineEdit.of('external') })
      exists = true
      propsRef.current.onExternal?.()
    })
    const offAdded = ck.onMarksAdded((e) => {
      if (e.key !== key || !view) return
      const text = view.state.doc.toString()
      const healed = healMarks(text, e.records)
      const add = healed.marks.map((record) => ({ record, from: healed.ranges.get(record.id)!.from, to: healed.ranges.get(record.id)!.to }))
      if (add.length) view.dispatch({ effects: addMarks.of(add) })
    })
    const offRemoved = ck.onMarksRemoved((e) => {
      if (e.key === key && view) view.dispatch({ effects: removeAlertMarks.of(e.alertId) })
    })

    return () => {
      live = false
      offFile()
      offAdded()
      offRemoved()
      void flush()
      unregister()
      propsRef.current.onView?.(null)
      viewRef.current = null
      view?.destroy()
      void exists
    }
    // The editor owns its document after creation; only the document key rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, app.settings.ghostText, app.settings.reviewWhenSeen])

  // The ban list follows the style page.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setBan.of(app.ban) })
  }, [app.ban])

  // Reveal a quoted passage, from a link in chat, an alert or the bible.
  useEffect(() => {
    const v = viewRef.current
    const r = props.reveal
    if (!v || !r || !loaded) return
    const at = findQuote(v.state.doc.toString(), r.quote)
    if (!at) return
    v.dispatch({ selection: EditorSelection.range(at.from, at.to), effects: EditorView.scrollIntoView(at.from, { y: 'center' }) })
    v.focus()
  }, [props.reveal, loaded])

  function pick(option: string): void {
    const v = viewRef.current
    if (!v || !alt) return
    // Choosing an alternative is the author's choice, so it lands reviewed.
    if (alt.suggestionId) acceptSuggestion(v, alt.suggestionId, option)
    else v.dispatch({ changes: { from: alt.from, to: alt.to, insert: option }, annotations: machineEdit.of('claude') })
    setAlt(null)
    v.focus()
  }

  /** Go back to the version the author had accepted before Claude updated it. */
  function restoreAccepted(): void {
    const v = viewRef.current
    if (!v || !alt?.accepted) return
    v.dispatch({ changes: { from: alt.accepted.from, to: alt.accepted.to, insert: alt.accepted.text }, annotations: machineEdit.of('claude') })
    setAlt(null)
    v.focus()
  }

  return (
    <div className={`doc-editor ${props.className ?? ''}`}>
      {saveError && (
        <div className="notice notice-error" role="alert">
          Could not save this page: {saveError}. Your text is safe here, and CyberKitty tries again every few seconds. If this keeps happening, something else may be holding the file, such as OneDrive or another editor.
        </div>
      )}
      <div ref={host} className="editor-host" />
      {alt && (
        <div className="alt-pop" style={{ left: Math.max(8, alt.x), top: alt.y }} role="listbox" aria-label="Alternatives">
          <div className="alt-head">
            <span>Other ways to say it</span>
            <button className="notice-x" aria-label="Close" onClick={() => setAlt(null)}>
              ×
            </button>
          </div>
          {alt.accepted && (
            <button className="alt-option alt-accepted" onClick={restoreAccepted} title="Put back the version you had accepted">
              <span className="alt-label mono">The version you accepted</span>
              {alt.accepted.text}
            </button>
          )}
          {alt.options === null && <div className="alt-loading">Asking the writer…</div>}
          {alt.error && <div className="alt-loading">{alt.error}</div>}
          {alt.options?.length === 0 && !alt.error && <div className="alt-loading">No alternatives came back.</div>}
          {alt.options?.map((o, i) => (
            <button key={i} className="alt-option" onClick={() => pick(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      {busy && (
        <div className="doc-busy" role="status">
          {busy}
          <button className="notice-x" aria-label="Dismiss" onClick={() => setBusy(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
