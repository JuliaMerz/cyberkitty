import { describe, expect, it } from 'vitest'
import { banList, findTells } from '@shared/tells'
import { linkFor, parseLink } from '@shared/links'
import { mergeSceneEntries } from '../src/main/bible'
import { locate } from '../src/main/suggest'
import { sanitizeSvg } from '../src/main/diagrams'
import { pairKey } from '../src/main/alerts'
import type { BibleEntry } from '@shared/types'

describe('tells', () => {
  it('reads the ban list from the style page', () => {
    const style = '# Style\n\n## Samples\n\nx\n\n## Ban list\n\n- tapestry\n- a testament to\n\n## Other\n- not this\n'
    expect(banList(style)).toEqual(['tapestry', 'a testament to'])
  })
  it('finds ban-list phrases without overlaps', () => {
    const hits = findTells('The harbor was a tapestry of lights, a testament to trade.', ['tapestry', 'a testament to'])
    expect(hits.map((h) => h.text.toLowerCase())).toEqual(expect.arrayContaining(['tapestry', 'a testament to']))
    for (let i = 1; i < hits.length; i++) expect(hits[i].from).toBeGreaterThanOrEqual(hits[i - 1].to)
  })
})

describe('links', () => {
  it('round-trips scene links with quotes and the notes file', () => {
    const href = linkFor({ kind: 'scene', sceneId: 'manuscript/01-a/02-b', file: 'notes' }, 'She said “no” & left')
    expect(parseLink(href)).toEqual({ kind: 'scene', sceneId: 'manuscript/01-a/02-b', file: 'notes', quote: 'She said “no” & left' })
  })
  it('parses page, alert and change links', () => {
    expect(parseLink(linkFor({ kind: 'page', name: 'outline.md' }, 'Act two'))).toEqual({ kind: 'page', name: 'outline.md', quote: 'Act two' })
    expect(parseLink('ck:alert/al1')).toEqual({ kind: 'alerts', id: 'al1' })
    expect(parseLink('ck:change/ch1')).toEqual({ kind: 'change', id: 'ch1' })
    expect(parseLink('https://example.com')).toBeNull()
  })
})

describe('locate', () => {
  it('tolerates curly and straight quotes', () => {
    const text = 'He said, “Go home.” Then nothing.'
    const at = locate(text, 'He said, "Go home."')
    expect(at && text.slice(at.from, at.to)).toBe('He said, “Go home.”')
  })
  it('returns null for words that are not there', () => {
    expect(locate('Nothing like it.', 'a scar on her left hand')).toBeNull()
  })
})

describe('bible merge', () => {
  const base = (over: Partial<BibleEntry>): BibleEntry => ({
    id: 'e1',
    type: 'character',
    subject: 'Mara',
    text: 'Mara has a scar on her left hand.',
    source: { kind: 'text', sceneId: 's1', quote: 'the scar on her left hand' },
    updatedAt: '2026-01-01',
    ...over
  })

  it('updates an entry when the text changes, keeping its history', () => {
    const out = mergeSceneEntries([base({})], 's1', [{ type: 'character', subject: 'Mara', text: 'Mara has a scar on her right hand.', quote: 'the scar on her right hand' }], 'now')
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Mara has a scar on her right hand.')
    expect(out[0].history?.[0].text).toBe('Mara has a scar on her left hand.')
  })

  it('leaves corrections alone and keeps entries from other scenes', () => {
    const other = base({ id: 'e2', source: { kind: 'text', sceneId: 's2', quote: 'q' } })
    const corrected = base({ corrected: true, text: 'Mara’s scar is on her left palm.' })
    const out = mergeSceneEntries([corrected, other], 's1', [{ type: 'character', subject: 'Mara', text: 'Different.', quote: 'the scar on her left hand' }])
    expect(out.find((e) => e.id === 'e1')?.text).toBe('Mara’s scar is on her left palm.')
    expect(out.find((e) => e.id === 'e2')).toBeTruthy()
  })

  it('drops facts the scene no longer states', () => {
    expect(mergeSceneEntries([base({})], 's1', [])).toEqual([])
  })
})

describe('diagrams', () => {
  it('strips scripts, handlers and outside links from SVG', () => {
    const svg = sanitizeSvg('junk <svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><a href="https://evil"><use href="#a"/></a></svg> tail')
    expect(svg).not.toMatch(/script|onload|evil/)
    expect(svg).toMatch(/href="#a"/)
    expect(svg.startsWith('<svg')).toBe(true)
  })
})

describe('alerts', () => {
  it('keys a disagreement by its pair, regardless of order and spacing', () => {
    const a = { ref: { kind: 'scene' as const, sceneId: 's1', file: 'prose' as const }, quote: 'left  hand' }
    const b = { ref: { kind: 'page' as const, name: 'characters.md' as const }, quote: 'Right hand' }
    expect(pairKey('continuity', [a, b])).toBe(pairKey('continuity', [b, { ...a, quote: 'left hand' }]))
    expect(pairKey('continuity', [a, b])).not.toBe(pairKey('timeline', [a, b]))
  })
})
