import { useEffect, useRef, useState } from 'react'
import type { ViewUpdate } from '@codemirror/view'
import { KeyBar } from './KeyBar'
import { MarkdownEditor } from './MarkdownEditor'

const ck = window.ck

/** The style page: goes into every writing prompt, so it is one click away. */
export function StylePage(): React.JSX.Element {
  const [doc, setDoc] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    void ck.readPage('style.md').then(setDoc)
  }, [])

  const onUpdate = (u: ViewUpdate): void => {
    if (!u.docChanged) return
    clearTimeout(timer.current)
    const text = u.state.doc.toString()
    timer.current = setTimeout(() => void ck.writePage('style.md', text), 400)
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-parent">Direction</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">Style</span>
        </div>
        <div className="header-right mono muted">style.md · goes into every writing prompt</div>
      </header>
      <div className="single-pane">
        {doc === null ? null : <MarkdownEditor docKey="style" doc={doc} kind="page" className="editor-host" onUpdate={onUpdate} />}
      </div>
      <KeyBar />
    </main>
  )
}
