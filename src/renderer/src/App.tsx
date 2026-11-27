import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { banList } from '@shared/tells'
import type { BookTree, JobStatus, NavTarget, PassageRef, Place, Settings, SpendSummary } from '@shared/types'
import { AppCtx, type AppApi } from './appContext'
import { Rail } from './components/Rail'
import { ScenePage } from './components/ScenePage'
import { SettingsPage } from './components/SettingsPage'
import { DocPage } from './components/DocPage'
import { ChapterPage } from './components/ChapterPage'
import { BiblePage, TimelinePage } from './components/BiblePage'
import { AlertsPage } from './components/AlertsPage'
import { ChangePage } from './components/ChangePage'
import { DiagramsPage, HistoryPage } from './components/MiscPages'
import { ChatPane } from './components/ChatPane'

const ck = window.ck

export type Route = NavTarget | { kind: 'settings' }

function firstScene(tree: BookTree): Route | null {
  const s = tree.chapters.flatMap((c) => c.scenes)[0]
  return s ? { kind: 'scene', sceneId: s.id } : { kind: 'page', name: 'summary.md' }
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // per-viewer convenience only
  }
}

export function App(): React.JSX.Element {
  const [tree, setTree] = useState<BookTree | null | undefined>(undefined)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [spend, setSpend] = useState<SpendSummary>({ todayUsd: 0, capUsd: 5 })
  const [route, setRoute] = useState<Route | null>(null)
  const [reveal, setReveal] = useState<{ quote: string; file: 'prose' | 'notes'; n: number } | null>(null)
  const [place, setPlace] = useState<Place>({ label: 'nowhere yet', page: 'none' })
  const [passages, setPassages] = useState<PassageRef[]>([])
  const [chatOpen, setChatOpen] = useState<boolean>(() => load('chatOpen', true))
  const [chatFocus, setChatFocus] = useState(0)
  const [ban, setBan] = useState<string[]>([])
  const [job, setJob] = useState<JobStatus | null>(null)
  const jobTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void Promise.all([ck.getBook(), ck.getSettings(), ck.getSpend()]).then(([t, s, sp]) => {
      setTree(t)
      setSettings(s)
      setSpend(sp)
      if (t) setRoute(firstScene(t))
    })
    const offs = [
      ck.onBookChanged(setTree),
      ck.onSpend(setSpend),
      ck.onJob((j) => {
        setJob(j)
        if (jobTimer.current) clearTimeout(jobTimer.current)
        if (j.state !== 'running') jobTimer.current = setTimeout(() => setJob(null), j.state === 'error' ? 15000 : 5000)
      }),
      ck.onNavigate((t) => navigate(t)),
      ck.onFileChanged((e) => {
        if (e.key === 'page:style.md' && e.text !== null) setBan(banList(e.text))
      })
    ]
    return () => offs.forEach((f) => f())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The ban list follows the style page; reread it when moving between pages.
  useEffect(() => {
    if (!tree) return
    void ck.readDoc({ kind: 'page', name: 'style.md' }).then((d) => setBan(banList(d.text)))
  }, [tree?.root, route?.kind, route?.kind === 'page' ? route.name : ''])

  const navigate = useCallback((t: NavTarget) => {
    setRoute(t)
    if ((t.kind === 'scene' || t.kind === 'page') && t.quote) {
      setReveal({ quote: t.quote, file: t.kind === 'scene' && t.file === 'notes' ? 'notes' : 'prose', n: Date.now() })
    } else setReveal(null)
  }, [])

  // The chat's place follows the page at once; an editor refines it to the paragraph.
  useEffect(() => {
    if (!tree || !route) return
    const chapterOf = (id: string): string | undefined => tree.chapters.find((c) => c.scenes.some((s) => s.id === id))?.id
    if (route.kind === 'scene') setPlace({ label: sceneTitle(route.sceneId), page: 'scene', sceneId: route.sceneId, chapterId: chapterOf(route.sceneId), file: route.file ?? 'prose' })
    else if (route.kind === 'chapter') {
      const c = tree.chapters.find((x) => x.id === route.chapterId)
      setPlace({ label: c ? `Chapter ${c.number}: ${c.title}` : 'Chapter', page: 'chapter', chapterId: route.chapterId })
    } else if (route.kind === 'page') setPlace({ label: route.name.replace('.md', '').replace(/^./, (x) => x.toUpperCase()), page: 'page', pageName: route.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  const sceneTitle = useCallback(
    (id: string) => tree?.chapters.flatMap((c) => c.scenes).find((s) => s.id === id)?.title ?? id.split('/').pop() ?? id,
    [tree]
  )

  const api: AppApi | null = useMemo(
    () =>
      settings
        ? {
            navigate,
            attach: (p) => {
              setPassages((cur) => [...cur, p])
              setChatOpen(true)
              setChatFocus(Date.now())
            },
            setPlace,
            settings,
            ban,
            sceneTitle
          }
        : null,
    [navigate, settings, ban, sceneTitle]
  )

  function opened(t: BookTree | null): void {
    if (!t) return
    setTree(t)
    setRoute(firstScene(t))
  }

  if (tree === undefined || !settings || !api) return <div className="splash" />
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

  const allScenes = tree.chapters.flatMap((c) => c.scenes)
  let page: React.JSX.Element
  if (route?.kind === 'scene' && allScenes.some((s) => s.id === route.sceneId)) {
    const chapter = tree.chapters.find((c) => c.scenes.some((s) => s.id === route.sceneId))
    page = (
      <ScenePage
        key={route.sceneId}
        sceneId={route.sceneId}
        title={sceneTitle(route.sceneId)}
        chapter={chapter}
        view={settings.sceneView}
        reveal={reveal}
        onViewChange={async (v) => setSettings(await ck.setSettings({ sceneView: v }))}
      />
    )
  } else if (route?.kind === 'chapter' && tree.chapters.some((c) => c.id === route.chapterId)) {
    page = <ChapterPage key={route.chapterId} chapter={tree.chapters.find((c) => c.id === route.chapterId)!} onTree={(t) => t && setTree(t)} />
  } else if (route?.kind === 'page') {
    page = <DocPage key={route.name} name={route.name} reveal={reveal} />
  } else if (route?.kind === 'bible') {
    page = <BiblePage focusId={route.id} />
  } else if (route?.kind === 'timeline') {
    page = <TimelinePage />
  } else if (route?.kind === 'alerts') {
    page = <AlertsPage tree={tree} focusId={route.id} job={job} />
  } else if (route?.kind === 'change') {
    page = <ChangePage key={route.id} id={route.id} />
  } else if (route?.kind === 'diagrams') {
    page = <DiagramsPage />
  } else if (route?.kind === 'history') {
    page = <HistoryPage />
  } else if (route?.kind === 'settings') {
    page = <SettingsPage settings={settings} onChange={setSettings} />
  } else {
    page = (
      <main className="page empty-page">
        <p className="muted">Start a chapter in the left rail, then add a scene to it.</p>
      </main>
    )
  }

  // Pages without an editor still tell the chat where the author is.
  const pagePlace: Place | null =
    route && route.kind !== 'scene' && route.kind !== 'page' && route.kind !== 'chapter'
      ? { label: route.kind === 'bible' ? 'Story bible' : route.kind[0].toUpperCase() + route.kind.slice(1), page: route.kind === 'diagrams' ? 'diagrams' : route.kind }
      : null

  return (
    <AppCtx.Provider value={api}>
      <div className={`app${chatOpen ? ' with-chat' : ''}`}>
        <Rail
          tree={tree}
          route={route}
          spend={spend}
          job={job}
          chatOpen={chatOpen}
          onOpen={(r) => {
            setReveal(null)
            setRoute(r)
          }}
          onNewChapter={async (title) => {
            const t = await ck.createChapter(title)
            setTree(t)
            const c = t.chapters.at(-1)
            if (c) setRoute({ kind: 'chapter', chapterId: c.id })
          }}
          onNewScene={async (chapterId, title) => {
            const r = await ck.createScene(chapterId, title)
            setTree(r.tree)
            setRoute({ kind: 'scene', sceneId: r.sceneId })
          }}
          onToggleChat={() =>
            setChatOpen((o) => {
              store('chatOpen', !o)
              return !o
            })
          }
        />
        {page}
        {chatOpen && (
          <ChatPane
            place={pagePlace ?? place}
            passages={passages}
            onRemovePassage={(i) => setPassages((cur) => cur.filter((_p, j) => j !== i))}
            onClearPassages={() => setPassages([])}
            focusNonce={chatFocus}
            onClose={() => {
              store('chatOpen', false)
              setChatOpen(false)
            }}
          />
        )}
      </div>
    </AppCtx.Provider>
  )
}
