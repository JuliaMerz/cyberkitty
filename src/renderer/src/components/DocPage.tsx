// A book page in one editor: the direction pages (summary, theme, tropes,
// characters, outline), the style page, and the planned bible.

import { useEffect, useState } from 'react'
import { DIRECTION_PAGES, type Alert, type DocRef, type PageName } from '@shared/types'
import { useApp } from '../appContext'
import { DocEditor } from './DocEditor'
import { KeyBar, stepTo, useCounts } from './KeyBar'

const ck = window.ck

const PLACEHOLDERS: Partial<Record<PageName, string>> = {
  'summary.md': 'What the book is, in a paragraph or two. It can change as the story finds itself.',
  'theme.md': 'What the book is about underneath the plot.',
  'tropes.md': '- Trope: played straight, or how it is turned',
  'characters.md': '## Name\n\nWho they are, what they want, how they talk.\n\nArc: where they start, where they end.',
  'outline.md': 'As loose or as tight as you like. Chapter by chapter, or just the big turns. It is normal for it to go stale as you write.'
}

export function DocPage({ name, reveal, extra }: { name: PageName; reveal?: { quote: string; n: number } | null; extra?: React.ReactNode }): React.JSX.Element {
  const app = useApp()
  const meta = DIRECTION_PAGES.find((p) => p.name === name)
  const title = meta?.title ?? (name === 'bible.md' ? 'Planned bible' : name.replace('.md', ''))
  const ref: DocRef = { kind: 'page', name }
  const [tick, setTick] = useState(0)
  const counts = useCounts([ref], tick)
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    const load = (): void => void ck.getAlerts().then(setAlerts)
    load()
    return ck.onDataChanged((w) => w === 'alerts' && load())
  }, [])

  const diverged = alerts.filter((a) => a.status === 'open' && a.kind === 'diverged').length
  const samples = alerts.filter((a) => a.status === 'open' && a.kind === 'style-sample')

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">{name === 'bible.md' ? 'Book' : 'Direction'}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{title}</span>
        </div>
        {extra}
        <div className="header-right">
          {name === 'outline.md' && diverged > 0 && (
            <button className="chip chip-orange" onClick={() => app.navigate({ kind: 'alerts' })}>
              {diverged} diverged
            </button>
          )}
          <span className="mono muted">{name}</span>
        </div>
      </header>
      {meta?.hint && <div className="page-hint">{meta.hint}</div>}
      {name === 'style.md' && samples.length > 0 && (
        <div className="notice notice-info">
          <span>
            Claude proposes a passage you wrote as a style sample.{' '}
            <button className="linkish" onClick={() => app.navigate({ kind: 'alerts', id: samples[0].id })}>
              Review it
            </button>
          </span>
        </div>
      )}
      <div className="single-pane">
        <DocEditor
          docRef={ref}
          kind="page"
          initial={`# ${title}\n\n`}
          placeholder={PLACEHOLDERS[name]}
          place={{ label: title, page: 'page', pageName: name }}
          reveal={reveal}
          onUpdate={(u) => (u.docChanged || u.transactions.some((t) => t.effects.length)) && setTick((t) => t + 1)}
          onView={() => setTick((t) => t + 1)}
        />
      </div>
      <KeyBar counts={counts} onStep={(k) => stepTo([ref], k)} />
    </main>
  )
}
