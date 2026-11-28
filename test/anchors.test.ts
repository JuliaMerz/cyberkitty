import { describe, expect, it } from 'vitest'
import { healMarks, makeAnchor, paragraphs, resolveAnchor } from '@shared/anchors'
import type { MarkRecord } from '@shared/types'

const text = `# Arrival

The ferry was late. By the time Mara stepped off, the harbor lights were on.

She saw Tomas before he saw her. He stood at the end of the quay.

The ferry was late.`

function mark(id: string, t: string, quote: string, nth = 0): MarkRecord {
  let from = -1
  for (let i = 0; i <= nth; i++) from = t.indexOf(quote, from + 1)
  return {
    id,
    kind: 'unreviewed',
    file: 'prose',
    anchor: makeAnchor(t, from, from + quote.length),
    origin: { source: 'draft', at: '2026-11-26T00:00:00Z' }
  }
}

describe('paragraphs', () => {
  it('splits on blank lines and trims', () => {
    const ps = paragraphs(text)
    expect(ps.map((p) => p.text)).toEqual([
      '# Arrival',
      'The ferry was late. By the time Mara stepped off, the harbor lights were on.',
      'She saw Tomas before he saw her. He stood at the end of the quay.',
      'The ferry was late.'
    ])
    for (const p of ps) expect(text.slice(p.from, p.to)).toBe(p.text)
  })
})

describe('resolveAnchor', () => {
  it('finds the exact words after text is inserted before them', () => {
    const m = mark('a', text, 'She saw Tomas before he saw her.')
    const edited = text.replace('# Arrival', '# Arrival\n\nA new opening paragraph.')
    const r = resolveAnchor(edited, m.anchor)!
    expect(r.how).toBe('exact')
    expect(edited.slice(r.from, r.to)).toBe('She saw Tomas before he saw her.')
  })

  it('uses context to pick the right one of two identical quotes', () => {
    const second = mark('b', text, 'The ferry was late.', 1)
    const edited = 'Prologue.\n\n' + text
    const r = resolveAnchor(edited, second.anchor)!
    expect(r.from).toBe(edited.lastIndexOf('The ferry was late.'))
  })

  it('falls back to the most similar paragraph after a light edit', () => {
    const p = 'She saw Tomas before he saw her. He stood at the end of the quay.'
    const m = mark('c', text, p)
    const edited = text.replace(p, 'She saw Tomas before he saw her. He stood alone at the far end of the quay.')
    const r = resolveAnchor(edited, m.anchor)!
    expect(r.how).toBe('fuzzy')
    expect(edited.slice(r.from, r.to)).toContain('alone at the far end')
  })

  it('gives up when the words are gone', () => {
    const m = mark('d', text, 'She saw Tomas before he saw her. He stood at the end of the quay.')
    const edited = text.replace(/She saw Tomas[^\n]*/, 'Nobody was there to meet her.')
    expect(resolveAnchor(edited, m.anchor)).toBeNull()
  })
})

describe('healMarks', () => {
  it('re-anchors moved marks and drops lost ones', () => {
    const a = mark('a', text, 'She saw Tomas before he saw her. He stood at the end of the quay.')
    const b = mark('b', text, 'The ferry was late. By the time Mara stepped off, the harbor lights were on.')
    // Paragraphs swapped, and the first one rewritten past recognition.
    const edited = `# Arrival\n\nShe saw Tomas before he saw her. He stood at the end of the quay.\n\nIt was dark when she landed.`
    const res = healMarks(edited, [a, b])
    expect(res.marks.map((m) => m.id)).toEqual(['a'])
    expect(res.dropped.map((m) => m.id)).toEqual(['b'])
    expect(res.marks[0].anchor.offset).toBe(edited.indexOf('She saw'))
  })

  it('never lets two in-file marks claim the same words', () => {
    const a = mark('a', text, 'The ferry was late.')
    const b = { ...a, id: 'b' }
    const res = healMarks(text, [a, b])
    expect(res.marks).toHaveLength(1)
  })
})
