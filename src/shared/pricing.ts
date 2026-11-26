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
}

export function costUsd(model: string, u: UsageLike): number {
  const p = PRICES[model] ?? FALLBACK
  const m = 1_000_000
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25) /
    m
  )
}

export const MODEL_CHOICES = Object.keys(PRICES)
