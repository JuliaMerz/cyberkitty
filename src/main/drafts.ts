// A draft streaming from the writer. While its scene is open, the editor puts
// each piece in place as it arrives. When the author leaves the scene mid-draft,
// the editor hands over (`detach`): it sends its text and where the draft
// stands, and from then on the rest of the draft is written into the file here,
// and marked unreviewed when it is done, as the editor would have.
//
// The file can change under a detached draft (the author comes back and
// types, an outside editor saves), so each write finds the draft's place again
// by the end of what has been inserted so far, rather than trusting an offset.

import { makeAnchor, paragraphs } from '@shared/anchors'
import type { DocRef, MarkRecord } from '@shared/types'
import { addMarks, newId, requireBook, state, writeDoc } from './state'

interface Detached {
  /** Where the draft began in the text the editor handed over. */
  start: number
  /** How much of the draft the editor had put in. */
  byEditor: number
  /** How much of the draft is in the file now. */
  inserted: number
  /** The text as this job last wrote it. */
  text: string
  pos: number
}

const TAIL = 160

export class DraftJob {
  text = ''
  private detached: Detached | null = null
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(
    readonly ref: DocRef,
    private readonly book = state.book
  ) {}

  delta(d: string): void {
    this.text += d
    if (this.detached) this.schedule(400)
  }

  /** The editor closed mid-draft: write what it had, then carry on in the file. */
  detach(docText: string, start: number, pos: number): void {
    if (this.detached || state.book !== this.book) return
    this.detached = { start, byEditor: pos - start, inserted: pos - start, text: docText, pos }
    this.writing = this.writing.then(() => writeDoc(this.ref, docText)).catch(() => undefined)
    this.schedule(300)
  }

  private schedule(ms: number): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.writing = this.writing.then(() => this.write()).catch((err) => console.error('draft write:', err))
    }, ms)
  }

  /** Where the draft continues in `file`, and how much of it is already there. */
  private locate(file: string, d: Detached): { pos: number; inserted: number } {
    if (file === d.text) return { pos: d.pos, inserted: d.inserted }
    // Find the end of what is in the file: first what this job inserted, then what the editor did.
    for (const n of [d.inserted, d.byEditor]) {
      const tail = this.text.slice(Math.max(0, n - TAIL), n)
      if (!tail.trim()) continue
      const i = file.lastIndexOf(tail)
      if (i >= 0) return { pos: i + tail.length, inserted: n }
    }
    // Nothing of the draft is recognisable: continue after what came before it.
    const before = d.text.slice(Math.max(0, d.start - TAIL), d.start)
    const i = before.trim() ? file.lastIndexOf(before) : -1
    if (i >= 0) return { pos: i + before.length, inserted: 0 }
    return { pos: file.length, inserted: 0 }
  }

  private async write(): Promise<void> {
    const d = this.detached
    if (!d || state.book !== this.book) return
    const file = (await requireBook().readDoc(this.ref)).text ?? ''
    const at = this.locate(file, d)
    // Pieces that arrive while this write is under way go in the next one.
    const upTo = this.text.length
    let rest = this.text.slice(at.inserted, upTo)
    if (!rest) return
    if (at.pos === file.length && at.inserted === 0 && file.trim()) rest = `${file.endsWith('\n\n') ? '' : file.endsWith('\n') ? '\n' : '\n\n'}${rest}`
    const next = file.slice(0, at.pos) + rest + file.slice(at.pos)
    await writeDoc(this.ref, next)
    d.text = next
    d.pos = at.pos + rest.length
    d.inserted = upTo
  }

  /** The draft is done: if the editor let go of it, write the rest and mark it unreviewed. */
  async finish(note: string): Promise<void> {
    if (!this.detached) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.writing = this.writing.then(() => this.write())
    await this.writing.catch(() => undefined)
    if (state.book !== this.book) return
    const file = (await requireBook().readDoc(this.ref)).text ?? ''
    const at = new Date().toISOString()
    const marks: MarkRecord[] = []
    let from = 0
    for (const p of paragraphs(this.text)) {
      const i = file.indexOf(p.text, from)
      if (i < 0) continue
      marks.push({ id: newId('m'), kind: 'unreviewed', file: 'prose', anchor: makeAnchor(file, i, i + p.text.length), origin: { source: 'draft', note, at } })
      from = i + p.text.length
    }
    await addMarks(this.ref, marks)
  }
}

/** Drafts in flight, by job id. */
export const draftsInFlight = new Map<string, DraftJob>()
