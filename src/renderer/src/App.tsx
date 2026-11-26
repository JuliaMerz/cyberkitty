import { useEffect, useState } from 'react'
import type { BookTree, Settings, SpendSummary } from '@shared/types'
import { Rail, type Place } from './components/Rail'
import { ScenePage } from './components/ScenePage'
import { SettingsPage } from './components/SettingsPage'
import { StylePage } from './components/StylePage'

const ck = window.ck

function firstScene(tree: BookTree): Place | null {
  const s = tree.chapters.flatMap((c) => c.scenes)[0]
  return s ? { kind: 'scene', sceneId: s.id } : null
}

export function App(): React.JSX.Element {
  const [tree, setTree] = useState<BookTree | null | undefined>(undefined)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [spend, setSpend] = useState<SpendSummary>({ todayUsd: 0, capUsd: 5 })
  const [place, setPlace] = useState<Place | null>(null)

  useEffect(() => {
    void Promise.all([ck.getBook(), ck.getSettings(), ck.getSpend()]).then(([t, s, sp]) => {
      setTree(t)
      setSettings(s)
      setSpend(sp)
      if (t) setPlace(firstScene(t))
    })
    const offBook = ck.onBookChanged(setTree)
    const offSpend = ck.onSpend(setSpend)
    return () => {
      offBook()
      offSpend()
    }
  }, [])

  function opened(t: BookTree | null): void {
    if (!t) return
    setTree(t)
    setPlace(firstScene(t))
  }

  if (tree === undefined || !settings) return <div className="splash" />
  if (tree === null) {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>CyberKitty</h1>
          <p>Write a novel with Claude, in your own voice. A book is a folder of Markdown files on your computer.</p>
          <div className="welcome-actions">
            <button className="btn btn-primary" onClick={() => void ck.createBookDialog().then(opened)}>
              New book
            </button>
            <button className="btn" onClick={() => void ck.openBookDialog().then(opened)}>
              Open a book folder
            </button>
            <button className="btn" onClick={() => void ck.openSampleBook().then(opened)}>
              Try the sample book
            </button>
          </div>
        </div>
      </div>
    )
  }

  const chapter =
    place?.kind === 'scene' ? tree.chapters.find((c) => c.scenes.some((s) => s.id === place.sceneId)) : undefined

  return (
    <div className="app">
      <Rail
        tree={tree}
        place={place}
        spend={spend}
        onOpen={setPlace}
        onNewChapter={async (title) => setTree(await ck.createChapter(title))}
        onNewScene={async (chapterId, title) => {
          const r = await ck.createScene(chapterId, title)
          setTree(r.tree)
          setPlace({ kind: 'scene', sceneId: r.sceneId })
        }}
      />
      {place?.kind === 'scene' ? (
        <ScenePage
          key={place.sceneId}
          sceneId={place.sceneId}
          chapter={chapter}
          view={settings.sceneView}
          onViewChange={async (v) => setSettings(await ck.setSettings({ sceneView: v }))}
        />
      ) : place?.kind === 'style' ? (
        <StylePage />
      ) : place?.kind === 'settings' ? (
        <SettingsPage settings={settings} onChange={setSettings} />
      ) : (
        <main className="page empty-page">
          <p className="muted">Start a chapter in the left rail, then add a scene to it.</p>
        </main>
      )}
    </div>
  )
}
