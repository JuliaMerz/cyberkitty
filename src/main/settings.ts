// App settings and the API key. Both live in the app's user-data folder, never
// in the book folder. The key is encrypted with the operating system's
// keychain through Electron's safeStorage.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { Settings, SpendSummary } from '@shared/types'

const dir = (): string => app.getPath('userData')

let cached: Settings | null = null
let sessionKey: string | null = null

export async function loadSettings(): Promise<Settings> {
  if (cached) return cached
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir(), 'settings.json'), 'utf8')) as Partial<Settings>
    cached = {
      ...DEFAULT_SETTINGS,
      ...raw,
      lanes: { ...DEFAULT_SETTINGS.lanes, ...(raw.lanes ?? {}) }
    }
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS)
  }
  return cached
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings()
  cached = { ...cur, ...patch, lanes: { ...cur.lanes, ...(patch.lanes ?? {}) } }
  await fs.mkdir(dir(), { recursive: true })
  await fs.writeFile(path.join(dir(), 'settings.json'), JSON.stringify(cached, null, 2))
  return cached
}

const keyFile = (): string => path.join(dir(), 'anthropic-key.bin')

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim()
  sessionKey = trimmed || null
  if (!trimmed) {
    await fs.rm(keyFile(), { force: true })
    return
  }
  // Without a keychain the key is kept for this session only, never in plain text.
  if (safeStorage.isEncryptionAvailable()) {
    await fs.mkdir(dir(), { recursive: true })
    await fs.writeFile(keyFile(), safeStorage.encryptString(trimmed))
  }
}

export async function getApiKey(): Promise<string | null> {
  if (sessionKey) return sessionKey
  try {
    if (safeStorage.isEncryptionAvailable()) {
      sessionKey = safeStorage.decryptString(await fs.readFile(keyFile()))
      return sessionKey
    }
  } catch {
    // no stored key
  }
  return process.env.ANTHROPIC_API_KEY || null
}

// Spend, per day, across books. The meter is for the author, who pays.
const spendFile = (): string => path.join(dir(), 'spend.json')

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

type Tokens = NonNullable<SpendSummary['tokens']>
const tokensFile = (): string => path.join(dir(), 'tokens.json')

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function addSpend(usd: number, tokens?: Tokens): Promise<SpendSummary> {
  const data = await readJsonFile<Record<string, number>>(spendFile(), {})
  data[today()] = (data[today()] ?? 0) + usd
  await fs.mkdir(dir(), { recursive: true })
  await fs.writeFile(spendFile(), JSON.stringify(data))
  const all = await readJsonFile<Record<string, Tokens>>(tokensFile(), {})
  const cur = all[today()] ?? { uncached: 0, cacheRead: 0, cacheWrite: 0 }
  if (tokens) {
    all[today()] = { uncached: cur.uncached + tokens.uncached, cacheRead: cur.cacheRead + tokens.cacheRead, cacheWrite: cur.cacheWrite + tokens.cacheWrite }
    await fs.writeFile(tokensFile(), JSON.stringify(all))
  }
  return { todayUsd: data[today()], capUsd: (await loadSettings()).dailyCapUsd, tokens: all[today()] ?? cur }
}

export async function getSpend(): Promise<SpendSummary> {
  const todayUsd = (await readJsonFile<Record<string, number>>(spendFile(), {}))[today()] ?? 0
  const tokens = (await readJsonFile<Record<string, Tokens>>(tokensFile(), {}))[today()]
  return { todayUsd, capUsd: (await loadSettings()).dailyCapUsd, tokens }
}
