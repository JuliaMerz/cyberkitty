// History (restore points) and diagrams.

import { useEffect, useState } from 'react'
import type { Diagram, RestorePoint } from '@shared/types'
import { KeyBar } from './KeyBar'

const ck = window.ck

export function HistoryPage(): React.JSX.Element {
  const [points, setPoints] = useState<RestorePoint[]>([])
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const load = (): void => void ck.getHistory().then(setPoints)
    load()
    return ck.onDataChanged((w) => w === 'history' && load())
  }, [])

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Book</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">History</span>
        </div>
        <div className="header-right">
          <button className="btn" onClick={() => void ck.getHistory().then(setPoints)}>
            Refresh
          </button>
        </div>
      </header>
      <div className="page-hint">CyberKitty keeps snapshots of the book whenever work settles and before Claude writes, in a hidden folder inside the book. Restoring keeps a snapshot of how things are now, so a restore can be undone too.</div>
      <div className="scroll-page">
        <ol className="history-list">
          {points.map((p) => (
            <li key={p.oid}>
              <span className="mono muted">{new Date(p.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span>{p.message}</span>
              {confirm === p.oid ? (
                <span className="history-confirm">
                  <button
                    className="btn small btn-primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      await ck.restore(p.oid)
                      setBusy(false)
                      setConfirm(null)
                      setPoints(await ck.getHistory())
                    }}
                  >
                    Restore the book to this
                  </button>
                  <button className="linkish small" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="linkish small" onClick={() => setConfirm(p.oid)}>
                  Restore…
                </button>
              )}
            </li>
          ))}
        </ol>
        {!points.length && <p className="muted empty-note">No snapshots yet.</p>}
      </div>
      <KeyBar />
    </main>
  )
}

export function DiagramsPage(): React.JSX.Element {
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => void ck.getDiagrams().then(setDiagrams)
    load()
    return ck.onDataChanged((w) => w === 'diagrams' && load())
  }, [])

  async function draw(): Promise<void> {
    setBusy(true)
    setError(null)
    const r = await ck.drawDiagram(request.trim())
    setBusy(false)
    if (r.ok) setRequest('')
    else setError(r.error ?? 'Claude could not draw that.')
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Book</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">Maps and diagrams</span>
        </div>
      </header>
      <div className="page-hint">Optional. Claude draws from the story bible: a map with character paths, a floor plan, a family tree, a web of relationships.</div>
      <div className="scroll-page">
        <div className="todo-add">
          <input className="field" placeholder="e.g. a map of the harbor town with Mara’s path on day one" value={request} onChange={(e) => setRequest(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && request.trim() && !busy && void draw()} />
          <button className="btn btn-primary" disabled={!request.trim() || busy} onClick={() => void draw()}>
            {busy ? 'Drawing…' : 'Draw'}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="diagram-grid">
          {diagrams
            .slice()
            .reverse()
            .map((d) => (
              <figure key={d.id} className="diagram">
                <img alt={d.title} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.svg)}`} />
                <figcaption>
                  <span>{d.title}</span>
                  <span className="mono muted">{d.kind}</span>
                  <button className="linkish small" onClick={() => void ck.deleteDiagram(d.id)}>
                    Delete
                  </button>
                </figcaption>
              </figure>
            ))}
        </div>
      </div>
      <KeyBar />
    </main>
  )
}
