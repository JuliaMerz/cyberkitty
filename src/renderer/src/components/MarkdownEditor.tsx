import { useEffect, useRef } from 'react'
import type { Extension } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { makeState, type EditorKind } from '../editor/setup'

interface Props {
  /** Changing the key rebuilds the editor with `doc`. */
  docKey: string
  doc: string
  kind: EditorKind
  placeholder?: string
  extra?: Extension[]
  onView?: (view: EditorView | null) => void
  onUpdate?: (u: ViewUpdate) => void
  className?: string
}

export function MarkdownEditor({ docKey, doc, kind, placeholder, extra, onView, onUpdate, className }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      state: makeState(doc, kind, {
        placeholder,
        extra: [...(extra ?? []), EditorView.updateListener.of((u) => onUpdateRef.current?.(u))]
      }),
      parent: host.current
    })
    onView?.(view)
    return () => {
      onView?.(null)
      view.destroy()
    }
    // The editor owns its document after creation; only docKey rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  return <div ref={host} className={className} />
}
