// A stand-in for Claude, for tests and demos without a key or network:
// CYBERKITTY_FAKE_WRITER=1. It is deliberately simple and deterministic.

import Anthropic from '@anthropic-ai/sdk'
import type { AgentTurnArgs, AgentTurnResult, StreamTextArgs, StreamTextResult } from './gateway'

async function trickle(text: string, onText: ((d: string) => void) | undefined, signal?: AbortSignal): Promise<void> {
  for (const chunk of text.match(/.{1,12}/gs) ?? []) {
    if (signal?.aborted) throw new Anthropic.APIUserAbortError()
    onText?.(chunk)
    // The pace can be slowed for tests that act while a draft streams.
    await new Promise((r) => setTimeout(r, Number(process.env.CYBERKITTY_FAKE_DELAY_MS) || 5))
  }
}

function firstSentence(s: string): string {
  return (/^[^.!?]+[.!?]/.exec(s.trim())?.[0] ?? s.trim()).trim()
}

export const fake = {
  async text(args: StreamTextArgs & { user: string }): Promise<StreamTextResult> {
    const notes = /<scene_notes[^>]*>([\s\S]*?)<\/scene_notes>/.exec(args.user)?.[1]
    const beats = /Draft only these beats from the notes:\n([\s\S]*?)(?:\n\n|<\/task>)/.exec(args.user)?.[1] ?? notes ?? ''
    const lines = beats
      .split('\n')
      .map((l) => l.replace(/^\s*[-*+]\s+/, '').trim())
      .filter((l) => l && !l.startsWith('#'))
    const span = /<span>([\s\S]*?)<\/span>/.exec(args.user)?.[1]
    let text: string
    if (span) text = `${span.trim().replace(/[.!?]?$/, '')}, plainly.`
    else if (args.user.includes('<ghost/>')) text = ' She did not look back.'
    else
      text = (lines.length ? lines : ['The ferry was late.'])
        .map((l) => (/^["“]/.test(l) ? l : `${l.charAt(0).toUpperCase()}${l.slice(1).replace(/[.]?$/, '.')}`))
        .join('\n\n')
    await trickle(text, args.onText, args.signal)
    return { text, model: 'fake-writer', costUsd: 0, refused: false }
  },

  structured(key: string, user: string): unknown {
    const sentence = /<sentence>([\s\S]*?)<\/sentence>/.exec(user)?.[1]?.trim() ?? 'It was late.'
    switch (key) {
      case 'alternatives':
        return { alternatives: [sentence.replace(/\.$/, ', again.'), `Plainly: ${sentence}`, sentence.split(' ').slice(0, 6).join(' ') + '.'] }
      case 'settle': {
        const prose = /<prose>([\s\S]*?)<\/prose>/.exec(user)?.[1] ?? ''
        const first = firstSentence(prose.replace(/^#[^\n]*\n/, ''))
        return {
          summary: first ? `In this scene: ${first}` : 'Nothing written yet.',
          entries: first
            ? [{ type: 'event', subject: 'Arrival', text: first, story_time: 'day 1', order: 1, quote: first, from: '', to: '' }]
            : []
        }
      }
      case 'scan':
        return { findings: [] }
      case 'change':
        return { title: 'Proposed change', spec: '## Goal\n\nA fake change spec.\n\n## Scene by scene\n\n- Every scene: as asked.\n\n## Must not change\n\n- Pinned lines.', scenes: [] }
      case 'diagram':
        return { title: 'Sketch', kind: 'other', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="10" y="50">diagram</text></svg>' }
      case 'outline-check':
        return { diverged: [] }
      default:
        return {}
    }
  },

  async agent(args: AgentTurnArgs): Promise<AgentTurnResult> {
    const last = args.messages[args.messages.length - 1]
    const blocks = Array.isArray(last.content) ? last.content : [{ type: 'text' as const, text: String(last.content) }]
    const toolResult = blocks.find((b) => b.type === 'tool_result')
    let reply: string
    if (toolResult && toolResult.type === 'tool_result') {
      const out = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content)
      const link = /Link: (ck:\S+)/.exec(out)?.[1]
      reply = link ? `I suggested [a new beat](${link}) in your notes.` : `That did not work: ${out}`
    } else {
      const text = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
      const scene = /scene_id="([^"]+)"/.exec(text)?.[1]
      const file = /file="(notes|prose)"/.exec(text)?.[1]
      const paragraph = /<paragraph>([\s\S]*?)<\/paragraph>/.exec(text)?.[1]?.trim()
      const message = /<message>([\s\S]*?)<\/message>/.exec(text)?.[1] ?? text
      if (scene && file === 'notes' && paragraph && /suggest/i.test(message)) {
        return {
          content: [
            { type: 'text', text: 'Let me suggest something.', citations: null },
            {
              type: 'tool_use',
              id: `toolu_fake_${Date.now()}`,
              name: 'suggest_insert',
              input: { doc: { scene_id: scene, file: 'notes' }, after_quote: paragraph, text: '- A gull lands on the rail and nobody shoos it.', note: 'texture' },
              caller: { type: 'direct' }
            }
          ] as AgentTurnResult['content'],
          stopReason: 'tool_use',
          model: 'fake-planner',
          costUsd: 0
        }
      }
      reply = 'Noted. Tell me more about what this scene is for.'
    }
    await trickle(reply, args.onText, args.signal)
    return { content: [{ type: 'text', text: reply, citations: null }] as AgentTurnResult['content'], stopReason: 'end_turn', model: 'fake-planner', costUsd: 0 }
  }
}
