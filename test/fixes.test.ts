// Fixes from the pre-release sanity check: a draft that outlives its editor,
// saves that Windows refuses for a moment, the starter style page, and how
// Anthropic's errors read.

import { cpSync, mkdtempSync, promises as fsp, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writerSystem } from '@shared/prompts'
import { filledStyle, STYLE_TEMPLATE, styleHasVoice } from '@shared/style'
import type { DocRef } from '@shared/types'
import { DraftJob } from '../src/main/drafts'
import { describeError } from '../src/main/gateway'
import { atomicWrite, Book } from '../src/main/project'
import { state } from '../src/main/state'

function openSample(): Book {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-fixes-'))
  cpSync(path.resolve('resources/sample-book'), dir, { recursive: true })
  state.book = new Book(dir)
  return state.book
}

describe('a draft that outlives its editor', () => {
  let book: Book
  let ref: DocRef
  const HEAD = '# Arrival\n\nThe ferry came in low.'
  beforeEach(async () => {
    book = openSample()
    ref = { kind: 'scene', sceneId: (await book.scenes())[0].id, file: 'prose' }
  })

  it('writes the rest of the draft after what the editor had, and marks every drafted paragraph', async () => {
    const job = new DraftJob(ref)
    job.delta('First paragraph of the draft. ')
    // The editor put in the first delta, then the author left the scene.
    const start = HEAD.length + 2
    const docText = `${HEAD}\n\nFirst paragraph of the draft. `
    job.detach(docText, start, docText.length)
    job.delta('It goes on.\n\nA second paragraph.')
    job.delta('\n\nA third.')
    await job.finish('drafted from notes')
    const doc = await book.readDoc(ref)
    expect(doc.text).toBe(`${HEAD}\n\nFirst paragraph of the draft. It goes on.\n\nA second paragraph.\n\nA third.`)
    expect(doc.marks.map((m) => m.kind)).toEqual(['unreviewed', 'unreviewed', 'unreviewed'])
    expect(doc.marks.every((m) => m.origin?.source === 'draft')).toBe(true)
  })

  it('finds its place again when the file changes under it', async () => {
    const job = new DraftJob(ref)
    job.delta('Gulls over the breakwater. ')
    const docText = `${HEAD}\n\nGulls over the breakwater. \n\nThe author's later paragraph.`
    const start = HEAD.length + 2
    job.detach(docText, start, start + 'Gulls over the breakwater. '.length)
    await new Promise((r) => setTimeout(r, 350))
    // The author comes back and types above the draft.
    const now = (await book.readDoc(ref)).text ?? ''
    await book.writeDoc(ref, now.replace('The ferry came in low.', 'The ferry came in low, listing.'))
    job.delta('The rope went taut.')
    await job.finish('drafted from notes')
    expect((await book.readDoc(ref)).text).toBe(`# Arrival\n\nThe ferry came in low, listing.\n\nGulls over the breakwater. The rope went taut.\n\nThe author's later paragraph.`)
  })

  it('does not skip pieces that arrive while it is writing', async () => {
    const job = new DraftJob(ref)
    job.delta('One. ')
    const write = book.writeDoc.bind(book)
    let calls = 0
    vi.spyOn(book, 'writeDoc').mockImplementation(async (r, text) => {
      // The second write is the draft's own; a piece streams in while it is on its way to disk.
      if (++calls === 2) job.delta('Three. ')
      return write(r, text)
    })
    job.detach(`${HEAD}\n\nOne. `, HEAD.length + 2, HEAD.length + 7)
    job.delta('Two. ')
    await new Promise((r) => setTimeout(r, 350))
    job.delta('Four.')
    await job.finish('drafted from notes')
    vi.restoreAllMocks()
    expect((await book.readDoc(ref)).text).toBe(`${HEAD}\n\nOne. Two. Three. Four.`)
  })

  it('writes everything when the author left before the first piece arrived', async () => {
    const job = new DraftJob(ref)
    job.delta('All of it.')
    job.detach(`${HEAD}\n\n`, HEAD.length + 2, HEAD.length + 2)
    job.delta(' Every word.')
    await job.finish('drafted from notes')
    expect((await book.readDoc(ref)).text).toBe(`${HEAD}\n\nAll of it. Every word.`)
  })

  it('leaves the file alone while the editor still holds the draft', async () => {
    const job = new DraftJob(ref)
    const before = (await book.readDoc(ref)).text
    job.delta('Only in the editor.')
    await job.finish('drafted from notes')
    expect((await book.readDoc(ref)).text).toBe(before)
  })
})

describe('saving when Windows holds the file', () => {
  afterEach(() => vi.restoreAllMocks())

  it('retries a refused rename, then saves', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-save-'))
    const file = path.join(dir, 'scene.md')
    const rename = fsp.rename.bind(fsp)
    let refused = 0
    vi.spyOn(fsp, 'rename').mockImplementation(async (a, b) => {
      if (refused++ < 2) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
      return rename(a, b)
    })
    await atomicWrite(file, 'saved text', [1, 1, 1])
    expect(readFileSync(file, 'utf8')).toBe('saved text')
    expect(refused).toBe(3)
  })

  it('writes in place when the rename never succeeds, and leaves no temp file', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-save-'))
    const file = path.join(dir, 'scene.md')
    vi.spyOn(fsp, 'rename').mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
    await atomicWrite(file, 'in place', [1, 1])
    expect(readFileSync(file, 'utf8')).toBe('in place')
    expect(await fsp.readdir(dir)).toEqual(['scene.md'])
  })

  it('fails at once on other errors', async () => {
    vi.spyOn(fsp, 'rename').mockRejectedValue(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-save-'))
    await expect(atomicWrite(path.join(dir, 'scene.md'), 'x', [1])).rejects.toThrow('ENOSPC')
    expect(await fsp.readdir(dir)).toEqual([])
  })
})

describe('the starter style page', () => {
  it('is not the author’s style', () => {
    expect(styleHasVoice(STYLE_TEMPLATE)).toBe(false)
    const page = filledStyle(STYLE_TEMPLATE)
    expect(page).not.toContain('Paste a few thousand words')
    expect(page).not.toContain('How your prose works')
    expect(page).toContain('## Ban list\n\n- something shifted')
    const style = writerSystem(STYLE_TEMPLATE)[2].text
    expect(style).toContain('has not given samples or a description')
    expect(style).toContain('- testament to')
    expect(style).not.toContain('Paste a few thousand words')
  })

  it('keeps what the author wrote, including over Windows line endings', () => {
    const md = STYLE_TEMPLATE.replace('Paste a few thousand words of your own prose here. A finished short story is a good start. Claude matches these more closely than anything you write about them.', 'The tide went out and took the jetty with it.').replace(/\n/g, '\r\n')
    expect(styleHasVoice(md)).toBe(true)
    const page = filledStyle(md)
    expect(page).toContain('## Samples\n\nThe tide went out')
    expect(page).not.toContain('## Description')
    expect(writerSystem(md)[2].text).not.toContain('has not given samples')
  })

  it('is empty when nothing is left', () => {
    expect(filledStyle('# Style\n\n## Samples\n\n## Description\n')).toBe('')
    expect(filledStyle(null)).toBe('')
  })
})

describe('Anthropic errors in words', () => {
  const err = (status: number, type: string, message: string): Error =>
    Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, undefined, new Headers())

  it('says Claude is busy for overloaded and server errors, mid-stream too', () => {
    expect(describeError(err(529, 'overloaded_error', 'Overloaded'))).toBe('Claude is busy right now. Try again in a moment.')
    expect(describeError(err(500, 'api_error', 'Internal server error'))).toBe('Claude is busy right now. Try again in a moment.')
    // How the SDK throws an error event that arrives in the middle of a stream.
    const midStream = new Anthropic.APIError(undefined, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, undefined, new Headers())
    expect(describeError(midStream)).toBe('Claude is busy right now. Try again in a moment.')
  })

  it('gives the message, not the JSON, for a bad request', () => {
    const text = describeError(err(400, 'invalid_request_error', 'max_tokens: must be at most 64000'))
    expect(text).toBe('Anthropic could not take that request: max_tokens: must be at most 64000')
    expect(text).not.toContain('{')
  })

  it('keeps the plain words it already had', () => {
    expect(describeError(err(401, 'authentication_error', 'invalid x-api-key'))).toBe('Anthropic did not accept the API key. Check it in Settings.')
    expect(describeError(err(429, 'rate_limit_error', 'slow down'))).toContain('rate limiting')
  })
})
