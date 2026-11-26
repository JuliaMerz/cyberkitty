import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view'
import { livePreview } from './livePreview'
import { markHover, marksField } from './marks'

export type EditorKind = 'prose' | 'notes' | 'page'

export function baseExtensions(kind: EditorKind, opts: { placeholder?: string; extra?: Extension[] } = {}): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    livePreview,
    marksField,
    markHover,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': kind === 'notes' ? 'Scene notes' : kind === 'prose' ? 'Scene prose' : 'Page' }),
    EditorView.editorAttributes.of({ class: `ck-editor ck-editor-${kind}` }),
    opts.placeholder ? placeholder(opts.placeholder) : [],
    ...(opts.extra ?? [])
  ]
}

export function makeState(doc: string, kind: EditorKind, opts: { placeholder?: string; extra?: Extension[] } = {}): EditorState {
  return EditorState.create({ doc, extensions: baseExtensions(kind, opts) })
}
