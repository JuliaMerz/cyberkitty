// The model gateway: the one module that talks to Anthropic. It streams,
// places cache breakpoints, handles refusals and errors, enforces the daily
// cap on background work and logs cost per task.

import Anthropic from '@anthropic-ai/sdk'
import type { BetaContentBlock, BetaMessageParam, BetaTextBlockParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { costUsd, promptTokens } from '@shared/pricing'
import type { SpendSummary } from '@shared/types'
import type { LaneSetting } from '@shared/types'
import { addSpend, getApiKey, getSpend } from './settings'
import { fake } from './fake'

export type SystemBlocks = BetaTextBlockParam[]

export class NoKeyError extends Error {
  constructor() {
    super('Add your Anthropic API key in Settings to let Claude work.')
  }
}

export class CapError extends Error {
  constructor() {
    super('Background work paused: today’s spending cap is reached. Raise it in Settings, or wait until tomorrow.')
  }
}

export class RefusedError extends Error {
  constructor() {
    super('Claude declined this request. Rephrase it, or pick another model for this kind of work in Settings and try again.')
  }
}

const FAKE = (): boolean => Boolean(process.env.CYBERKITTY_FAKE_WRITER)
const BETAS = ['server-side-fallback-2026-07-01']

let onSpend: ((s: SpendSummary) => void) | null = null
export function setSpendListener(fn: (s: SpendSummary) => void): void {
  onSpend = fn
}

async function client(): Promise<Anthropic> {
  const apiKey = await getApiKey()
  if (!apiKey) throw new NoKeyError()
  return new Anthropic({ apiKey })
}

async function record(model: string, usage: Parameters<typeof costUsd>[1]): Promise<number> {
  const usd = costUsd(model, usage)
  if (usd > 0) onSpend?.(await addSpend(usd, promptTokens(usage)))
  return usd
}

/** Whether Claude can be called at all: a key is set, or the stand-in model is on. */
export async function canCall(): Promise<boolean> {
  return FAKE() || Boolean(await getApiKey())
}

export async function checkCap(): Promise<void> {
  const s = await getSpend()
  if (s.capUsd > 0 && s.todayUsd >= s.capUsd) throw new CapError()
}

export interface StreamTextArgs {
  lane: LaneSetting
  system: SystemBlocks
  user: string
  maxTokens: number
  signal?: AbortSignal
  onText?: (delta: string) => void
  background?: boolean
}

export interface StreamTextResult {
  text: string
  model: string
  costUsd: number
  refused: boolean
}

/** One streamed text reply. */
export async function streamText(args: StreamTextArgs): Promise<StreamTextResult> {
  if (args.background) await checkCap()
  if (FAKE()) return fake.text(args)
  const c = await client()
  // Dark fiction can trip a safety classifier. Server-side fallback reruns a
  // declined request on a model that will take it, inside the same call.
  const stream = c.beta.messages.stream(
    {
      model: args.lane.model,
      max_tokens: args.maxTokens,
      betas: BETAS,
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
    args.onText?.(delta)
  })
  const final = await stream.finalMessage()
  return { text, model: final.model, costUsd: await record(final.model, final.usage), refused: final.stop_reason === 'refusal' }
}

/** A reply in a JSON shape, for anything the app parses. Replaces v1's regex parsing. */
export async function structured<T>(args: {
  lane: LaneSetting
  system: SystemBlocks
  user: string
  schema: Record<string, unknown>
  maxTokens?: number
  signal?: AbortSignal
  background?: boolean
  fakeKey: string
}): Promise<T> {
  if (args.background) await checkCap()
  if (FAKE()) return fake.structured(args.fakeKey, args.user) as T
  const c = await client()
  const stream = c.beta.messages.stream(
    {
      model: args.lane.model,
      max_tokens: args.maxTokens ?? 32000,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: args.lane.effort, format: { type: 'json_schema', schema: args.schema } },
      system: args.system,
      messages: [{ role: 'user', content: args.user }]
    },
    { signal: args.signal }
  )
  const final = await stream.finalMessage()
  await record(final.model, final.usage)
  if (final.stop_reason === 'refusal') throw new RefusedError()
  const text = final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Claude’s reply could not be read. Try again.')
  }
}

export interface AgentTurnArgs {
  lane: LaneSetting
  system: SystemBlocks
  tools: BetaToolUnion[]
  messages: BetaMessageParam[]
  signal?: AbortSignal
  onText?: (delta: string) => void
}

export interface AgentTurnResult {
  content: BetaContentBlock[]
  stopReason: string | null
  model: string
  costUsd: number
  /** The whole prompt's size in tokens, cached or not. */
  promptTokens?: number
}

/** One request of the planner's agent loop. The caller runs tools and loops. */
export async function agentTurn(args: AgentTurnArgs): Promise<AgentTurnResult> {
  if (FAKE()) return fake.agent(args)
  const c = await client()
  const stream = c.beta.messages.stream(
    {
      model: args.lane.model,
      max_tokens: 64000,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: args.lane.effort },
      system: args.system,
      tools: args.tools,
      messages: args.messages,
      // The growing conversation is cached automatically. One hour, like the
      // system blocks before it (longer TTLs must come first): the author
      // replies at a human pace, often more than five minutes apart.
      cache_control: { type: 'ephemeral', ttl: '1h' }
    },
    { signal: args.signal }
  )
  stream.on('text', (delta) => args.onText?.(delta))
  const final = await stream.finalMessage()
  const u = final.usage
  return {
    content: final.content,
    stopReason: final.stop_reason,
    model: final.model,
    costUsd: await record(final.model, u),
    promptTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  }
}

export function describeError(err: unknown): string {
  if (err instanceof NoKeyError || err instanceof CapError || err instanceof RefusedError) return err.message
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic did not accept the API key. Check it in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic is rate limiting this key. Try again in a minute.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check the connection and try again.'
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  if (err instanceof Anthropic.APIError) return `Anthropic returned an error: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

/** The API rejected the request itself (as opposed to a passing failure). */
export function isBadRequest(err: unknown): boolean {
  return err instanceof Anthropic.BadRequestError
}

export function isAbort(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === 'AbortError')
}
