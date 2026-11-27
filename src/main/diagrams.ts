// Diagrams: Claude draws a map, floor plan, family tree or relationship web
// from the bible, as SVG. Optional; a story set in one room needs none.

import { jobSystem } from '@shared/briefing'
import type { Diagram } from '@shared/types'
import { bibleText, directionText } from './context'
import { structured } from './gateway'
import { loadSettings } from './settings'
import { newId } from './state'
import { diagramStore } from './stores'

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    kind: { type: 'string', enum: ['map', 'floorplan', 'family', 'relationships', 'other'] },
    svg: { type: 'string', description: 'A self-contained SVG with a viewBox, no scripts, no external references, readable at 800px wide. Use #1B1E27 for ink, #5B6170 for labels, #3A45C9 for character paths.' }
  },
  required: ['title', 'kind', 'svg'],
  additionalProperties: false
}

/** Keep only inert SVG: no scripts, event handlers, foreign content or outside links. */
export function sanitizeSvg(svg: string): string {
  let s = svg.trim()
  const start = s.indexOf('<svg')
  const end = s.lastIndexOf('</svg>')
  if (start < 0 || end < 0) throw new Error('Claude did not return an SVG.')
  s = s.slice(start, end + 6)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
  s = s.replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
  return s
}

export async function drawDiagram(request: string): Promise<Diagram> {
  const res = await structured<{ title: string; kind: Diagram['kind']; svg: string }>({
    lane: (await loadSettings()).lanes.planner,
    system: jobSystem('You draw clear, quiet diagrams for a novelist from their story bible. Draw only what the bible supports. Label everything.'),
    user: `${await directionText()}\n\n${await bibleText()}\n\n<request>${request}</request>`,
    schema: SCHEMA,
    maxTokens: 32000,
    fakeKey: 'diagram'
  })
  const d: Diagram = { id: newId('d'), title: res.title, kind: res.kind, svg: sanitizeSvg(res.svg), at: new Date().toISOString() }
  await diagramStore.update((all) => [...all, d])
  return d
}
