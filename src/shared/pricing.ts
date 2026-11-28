// Approximate list prices per million tokens (USD), early November 2026.
// Used only for the spend meter and the daily cap; check before budgeting.

interface Price {
  input: number
  output: number
  cacheRead: number
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 }
}

const FALLBACK: Price = { input: 8, output: 40, cacheRead: 0.8 }

export interface UsageLike {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  /** Cache writes by lifetime: 5-minute writes cost 1.25x input, 1-hour writes 2x. */
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null
}

/** Prompt tokens by how they were billed: uncached, read from cache, written to it. */
export function promptTokens(u: UsageLike): { uncached: number; cacheRead: number; cacheWrite: number } {
  return { uncached: u.input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 }
}

export function costUsd(model: string, u: UsageLike): number {
  const p = PRICES[model] ?? FALLBACK
  const m = 1_000_000
  const written = u.cache_creation_input_tokens ?? 0
  const oneHour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const fiveMin = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : written
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      fiveMin * p.input * 1.25 +
      oneHour * p.input * 2) /
    m
  )
}

export const MODEL_CHOICES = Object.keys(PRICES)
