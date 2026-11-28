// Obsidian-style live preview: Markdown syntax fades away until the cursor is
// on it. The document stays plain Markdown; only the rendering changes.

import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const s = document.createElement('span')
    s.className = 'cm-bullet'
    s.textContent = '•'
    return s
  }
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

function lineTouched(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  return selectionTouches(state, line.from, line.to)
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const marks: Range<Decoration>[] = []
  const lines = new Map<number, string>()
  const focused = view.hasFocus

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          lines.set(state.doc.lineAt(node.from).from, `cm-h${heading[1]}`)
          return
        }
        if (name === 'HeaderMark') {
          if (focused && lineTouched(state, node.from)) return
          const next = state.doc.sliceString(node.to, node.to + 1)
          marks.push(hide.range(node.from, next === ' ' ? node.to + 1 : node.to))
          return
        }
        if (name === 'Emphasis') marks.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
        if (name === 'StrongEmphasis') marks.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
        if (name === 'Strikethrough') marks.push(Decoration.mark({ class: 'cm-strike' }).range(node.from, node.to))
        if (name === 'InlineCode') marks.push(Decoration.mark({ class: 'cm-code' }).range(node.from, node.to))
        if (name === 'EmphasisMark' || name === 'CodeMark' || name === 'StrikethroughMark') {
          const parent = node.node.parent
          if (focused && parent && selectionTouches(state, parent.from, parent.to)) return
          if (node.from < node.to) marks.push(hide.range(node.from, node.to))
          return
        }
        if (name === 'Blockquote') {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos)
            lines.set(line.from, 'cm-quote')
            pos = line.to + 1
          }
          return
        }
        if (name === 'QuoteMark') {
          if (focused && lineTouched(state, node.from)) return
          const next = state.doc.sliceString(node.to, node.to + 1)
          marks.push(hide.range(node.from, next === ' ' ? node.to + 1 : node.to))
          return
        }
        if (name === 'ListMark') {
          const text = state.doc.sliceString(node.from, node.to)
          if (/^[-*+]$/.test(text) && !(focused && lineTouched(state, node.from))) {
            marks.push(bullet.range(node.from, node.to))
          } else {
            marks.push(Decoration.mark({ class: 'cm-listmark' }).range(node.from, node.to))
          }
          return
        }
        if (name === 'Link') {
          marks.push(Decoration.mark({ class: 'cm-link' }).range(node.from, node.to))
          return
        }
        if (name === 'LinkMark' || name === 'URL') {
          const parent = node.node.parent
          if (parent?.name !== 'Link') return
          if (focused && selectionTouches(state, parent.from, parent.to)) return
          if (node.from < node.to) marks.push(hide.range(node.from, node.to))
        }
      }
    })
  }

  const builder = new RangeSetBuilder<Decoration>()
  const all: Range<Decoration>[] = [
    ...[...lines].map(([pos, cls]) => Decoration.line({ class: cls }).range(pos)),
    ...marks
  ]
  all.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  for (const r of all) builder.add(r.from, r.to, r.value)
  return builder.finish()
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)
