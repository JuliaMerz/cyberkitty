// The model gateway: the one module that talks to Anthropic. It streams,
// handles refusals and errors, and logs cost per task. This slice has the
// writer lane; the planner's agent loop arrives with chat.

import Anthropic from '@anthropic-ai/sdk'
import { costUsd } from '@shared/pricing'
import type { LaneSetting } from '@shared/types'
import { getApiKey } from './settings'

export interface StreamTextArgs {
  lane: LaneSetting
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  user: string
  maxTokens: number
  signal: AbortSignal
  onText: (delta: string) => void
}

export interface StreamTextResult {
  text: string
  model: string
  costUsd: number
  refused: boolean
  stopReason: string | null
}

export class NoKeyError extends Error {
  constructor() {
    super('Add your Anthropic API key in Settings to let Claude write.')
  }
}

export async function streamText(args: StreamTextArgs): Promise<StreamTextResult> {
  if (process.env.CYBERKITTY_FAKE_WRITER) return fakeStream(args)

  const apiKey = await getApiKey()
  if (!apiKey) throw new NoKeyError()
  const client = new Anthropic({ apiKey })

  // Dark fiction can trip a safety classifier. Server-side fallback reruns a
  // declined request on a model that will take it, inside the same call.
  const stream = client.beta.messages.stream(
    {
      model: args.lane.model,
      max_tokens: args.maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: args.lane.effort },
      system: args.system,
      messages: [{ role: 'user', content: args.user }]
    },
    { signal: args.signal }
  )

  let text = ''
  stream.on('text', (delta) => {
    text += delta
    args.onText(delta)
  })
  const final = await stream.finalMessage()
  return {
    text,
    model: final.model,
    costUsd: costUsd(final.model, final.usage),
    refused: final.stop_reason === 'refusal',
    stopReason: final.stop_reason
  }
}

export function describeError(err: unknown): string {
  if (err instanceof NoKeyError) return err.message
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic did not accept the API key. Check it in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic is rate limiting this key. Try again in a minute.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check the connection and try again.'
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  if (err instanceof Anthropic.APIError) return `Anthropic returned an error: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

/** A stand-in writer for tests and demos without a key: CYBERKITTY_FAKE_WRITER=1. */
async function fakeStream(args: StreamTextArgs): Promise<StreamTextResult> {
  const beats = /<scene_notes[^>]*>([\s\S]*?)<\/scene_notes>/.exec(args.user)?.[1] ?? ''
  const lines = beats
    .split('\n')
    .map((l) => l.replace(/^\s*[-*+]\s+/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
  const paras = lines.length
    ? lines.map((l) => (/^["“]/.test(l) ? l : `${l.charAt(0).toUpperCase()}${l.slice(1).replace(/[.]?$/, '.')}`))
    : ['The ferry was late.']
  const text = paras.join('\n\n')
  for (const chunk of text.match(/.{1,12}/gs) ?? []) {
    if (args.signal.aborted) throw new Anthropic.APIUserAbortError()
    args.onText(chunk)
    await new Promise((r) => setTimeout(r, 8))
  }
  return { text, model: 'fake-writer', costUsd: 0, refused: false, stopReason: 'end_turn' }
}
