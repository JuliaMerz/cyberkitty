// Every channel the UI can call must be in the action table, either logged or
// quiet with a reason, and the main process must register channels only
// through that table. Then a new action cannot skip the event log unnoticed.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HANDLED, SENT, settingsText } from '../src/main/actions'

const preload = readFileSync(path.resolve('src/preload/index.ts'), 'utf8')
const main = readFileSync(path.resolve('src/main/index.ts'), 'utf8')

const invoked = [...preload.matchAll(/inv\('([^']+)'/g)].map((m) => m[1])
const sent = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1])

describe('the action table', () => {
  it('covers every channel the UI invokes', () => {
    expect(invoked.length).toBeGreaterThan(40)
    expect(invoked.filter((c) => !HANDLED[c])).toEqual([])
  })

  it('covers every channel the UI sends to', () => {
    expect(sent.filter((c) => !SENT[c])).toEqual([])
  })

  it('gives each entry a log or a reason for staying quiet', () => {
    for (const [channel, e] of [...Object.entries(HANDLED), ...Object.entries(SENT)]) {
      expect(Boolean(e.log) !== Boolean(e.quiet), channel).toBe(true)
    }
  })

  it('is the only way the main process registers channels', () => {
    // The two raw registrations are inside `handle` and `on` themselves.
    expect(main.match(/ipcMain\.(handle|on)\(/g)).toHaveLength(2)
    const registered = [...main.matchAll(/^\s+(handle|on)\('([^']+)'/gm)].map((m) => m[2])
    expect(registered.filter((c) => !HANDLED[c] && !SENT[c])).toEqual([])
    expect([...invoked, ...sent].filter((c) => !registered.includes(c))).toEqual([])
  })

  it('saves held-back typing before anything that calls Claude', () => {
    for (const c of ['draft:start', 'tool:alternatives', 'tool:rewrite', 'chat:send', 'changes:propose', 'changes:run', 'alerts:scan', 'diagrams:draw', 'history:restore', 'book:close']) {
      expect(HANDLED[c].flush, c).toBe(true)
    }
  })
})

describe('settings in the log', () => {
  it('names what Claude’s work depends on and leaves out the rest', () => {
    expect(settingsText({ blockingHelp: 'lots', reviewWhenSeen: true })).toBe('The author changed Settings: how much Claude volunteers: lots; count a paragraph as reviewed once it has been on screen: on.')
    expect(settingsText({ lastBook: '/books/a', sceneView: 'both' })).toBeNull()
  })
})
