// One global chat, beside every page. Every message carries the author's
// place, so "this" and "here" mean what they are looking at. Links Claude
// writes point into the book and wear the mark of what they point to.

import { Fragment, useEffect, useRef, useState } from 'react'
import { parseLink } from '@shared/links'
import type { ChatEntry, DocRef, NavTarget, PassageRef, Place } from '@shared/types'
import { markAt, onEditorsChanged, useApp } from '../appContext'

const ck = window.ck

interface Props {
  place: Place
  passages: PassageRef[]
  onRemovePassage: (i: number) => void
  onClearPassages: () => void
  focusNonce: number
  onClose: () => void
}

export function ChatPane({ place, passages, onRemovePassage, onClearPassages, focusNonce, onClose }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [text, setText] = useState('')
  const [hasKey, setHasKey] = useState(true)
  const [, setN] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void ck.getChat().then(setEntries)
    void ck.hasApiKey().then(setHasKey)
    const off = ck.onChat(setEntries)
    const offEd = onEditorsChanged(() => setN((n) => n + 1))
    return () => {
      off()
      offEd()
    }
  }, [])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [entries])

  useEffect(() => {
    if (focusNonce) input.current?.focus()
  }, [focusNonce])

  const streaming = entries.some((e) => e.streaming)

  function send(): void {
    const t = text.trim()
    if (!t || streaming) return
    setText('')
    onClearPassages()
    void ck.hasApiKey().then((k) => {
      setHasKey(k)
      void ck.sendChat(t, place, passages)
    })
  }

  return (
    <aside className="chat" aria-label="Chat with Claude">
      <header className="chat-head">
        <span className="chat-title">Chat</span>
        <span className="mono muted">one conversation for the whole book</span>
        <button className="notice-x" aria-label="Hide chat" title="Hide chat" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="chat-list" ref={list}>
        {entries.length === 0 && (
          <div className="chat-empty">
            <p>Talk through the story here: what a scene is for, what could happen next, what does not fit.</p>
            <p>Claude sees where you are. Select text and press Comment to talk about a passage. Anything Claude does to your words arrives on the page as a suggestion.</p>
          </div>
        )}
        {entries.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
      </div>
      {!hasKey && <div className="chat-warn">Add your Anthropic API key in Settings to chat.</div>}
      <div className="chat-compose">
        <div className="chat-place" title="Claude sees this place with your message">
          <span className="place-chip">on {place.label}</span>
          {place.selection && <span className="place-chip">selection</span>}
        </div>
        {passages.length > 0 && (
          <div className="chat-passages">
            {passages.map((p, i) => (
              <span key={i} className="passage-chip" title={p.quote}>
                {p.label}: “{p.quote.length > 48 ? `${p.quote.slice(0, 48)}…` : p.quote}”
                <button aria-label="Remove" onClick={() => onRemovePassage(i)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={input}
          value={text}
          placeholder={passages.length ? 'Say something about this passage…' : 'Message Claude'}
          aria-label="Message Claude"
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="chat-actions">
          <span className="mono muted">Enter to send · Shift+Enter for a new line</span>
          {streaming ? (
            <button className="btn" onClick={() => ck.stopChat()}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={send} disabled={!text.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

function Entry({ entry }: { entry: ChatEntry }): React.JSX.Element {
  if (entry.role === 'activity') return <div className="chat-activity">Claude {entry.text}</div>
  return (
    <div className={`chat-entry ${entry.role}${entry.error ? ' error' : ''}`}>
      {entry.role === 'author' && entry.place && <div className="mono muted chat-where">on {entry.place.label}</div>}
      {entry.passages?.map((p, i) => (
        <div key={i} className="chat-quote">
          “{p.quote}”
        </div>
      ))}
      <Markdown text={entry.text || (entry.streaming ? '…' : '')} />
      {entry.streaming && <span className="pulse" aria-label="Claude is writing" />}
    </div>
  )
}

// ---- A small, safe Markdown renderer -------------------------------------------

export function Markdown({ text }: { text: string }): React.JSX.Element {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*+]|\d+\.)\s/.test(l) || !l.trim())) {
          const ordered = /^\s*\d+\./.test(lines[0])
          const items = lines.filter((l) => l.trim()).map((l) => l.replace(/^\s*([-*+]|\d+\.)\s+/, ''))
          const Tag = ordered ? 'ol' : 'ul'
          return (
            <Tag key={i}>
              {items.map((it, j) => (
                <li key={j}>
                  <Inline text={it} />
                </li>
              ))}
            </Tag>
          )
        }
        const h = /^(#{1,4})\s+(.*)$/.exec(b)
        if (h && lines.length === 1) return <p key={i} className="chat-h"><Inline text={h[2]} /></p>
        if (/^>\s?/.test(b)) return <blockquote key={i}><Inline text={b.replace(/^>\s?/gm, '')} /></blockquote>
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

function targetRef(t: NavTarget): DocRef | null {
  if (t.kind === 'scene') return { kind: 'scene', sceneId: t.sceneId, file: t.file ?? 'prose' }
  if (t.kind === 'page') return { kind: 'page', name: t.name }
  return null
}

function Inline({ text }: { text: string }): React.JSX.Element {
  const app = useApp()
  const out: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let k = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      const target = parseLink(m[2])
      if (target) {
        const ref = targetRef(target)
        const quote = target.kind === 'scene' || target.kind === 'page' ? target.quote : undefined
        const wears = ref ? markAt(ref, quote) : target.kind === 'alerts' ? 'conflict' : null
        out.push(
          <button key={k++} className={`ck-link${wears ? ` ck-mark ck-${wears}` : ''}`} onClick={() => app.navigate(target)} title={wears ? `${wears}: click to go there` : 'Click to go there'}>
            {m[1]}
          </button>
        )
      } else if (/^https?:/.test(m[2])) {
        out.push(
          <a key={k++} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        )
      } else out.push(m[1])
    } else if (m[3] !== undefined) out.push(<strong key={k++}>{m[3]}</strong>)
    else if (m[4] !== undefined) out.push(<em key={k++}>{m[4]}</em>)
    else if (m[5] !== undefined) out.push(<code key={k++}>{m[5]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
