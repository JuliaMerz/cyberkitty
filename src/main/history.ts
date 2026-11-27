// Hidden history. The app snapshots the book into its own git repository at
// .cyberkitty/history.git whenever work settles and before Claude writes. The
// author's own git, if any, is never touched: this repository keeps its git
// directory apart from the book folder.

import fs from 'node:fs'
import path from 'node:path'
import git from 'isomorphic-git'
import { META } from './project'

const GITDIR = `${META}/history.git`
const AUTHOR = { name: 'CyberKitty', email: 'history@cyberkitty.local' }

function tracked(filepath: string): boolean {
  if (filepath.startsWith(GITDIR)) return false
  if (filepath.endsWith('.tmp')) return false
  return filepath.endsWith('.md') || ((filepath.startsWith(`${META}/scenes/`) || filepath.startsWith(`${META}/docs/`)) && filepath.endsWith('.json'))
}

export class History {
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly root: string) {}

  private get gitdir(): string {
    return path.join(this.root, GITDIR)
  }

  /** Commit the book as it stands, if anything changed. Returns the commit id or null. */
  snapshot(label: string): Promise<string | null> {
    const run = this.chain.then(() => this.doSnapshot(label))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async doSnapshot(label: string): Promise<string | null> {
    const dir = this.root
    const gitdir = this.gitdir
    if (!fs.existsSync(path.join(gitdir, 'HEAD'))) {
      await git.init({ fs, dir, gitdir, defaultBranch: 'main' })
    }
    const matrix = await git.statusMatrix({ fs, dir, gitdir, filter: tracked })
    let changed = false
    for (const [filepath, head, workdir, stage] of matrix) {
      if (head === workdir && workdir === stage) continue
      changed = true
      if (workdir === 0) await git.remove({ fs, dir, gitdir, filepath })
      else await git.add({ fs, dir, gitdir, filepath })
    }
    if (!changed) return null
    return git.commit({ fs, dir, gitdir, message: label, author: AUTHOR })
  }

  /**
   * Put the book back as it was at a snapshot. The current state is
   * snapshotted first, so a restore is itself undoable. Files are written
   * through the working tree, never by moving the branch.
   */
  restore(oid: string): Promise<string[]> {
    const run = this.chain.then(() => this.doRestore(oid))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async doRestore(oid: string): Promise<string[]> {
    const dir = this.root
    const gitdir = this.gitdir
    await this.doSnapshot('Before restoring an earlier version')
    const then = new Set(await git.listFiles({ fs, dir, gitdir, ref: oid }))
    const now = await git.listFiles({ fs, dir, gitdir, ref: 'HEAD' })
    const touched: string[] = []
    for (const filepath of then) {
      if (!tracked(filepath)) continue
      const { blob } = await git.readBlob({ fs, dir, gitdir, oid, filepath })
      const abs = path.join(dir, filepath)
      const next = Buffer.from(blob)
      let cur: Buffer | null = null
      try {
        cur = fs.readFileSync(abs)
      } catch {
        cur = null
      }
      if (cur && cur.equals(next)) continue
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, next)
      touched.push(filepath)
    }
    for (const filepath of now) {
      if (then.has(filepath) || !tracked(filepath)) continue
      try {
        fs.unlinkSync(path.join(dir, filepath))
        touched.push(filepath)
      } catch {
        // already gone
      }
    }
    await this.doSnapshot('Restored an earlier version')
    return touched
  }

  async log(depth = 50): Promise<Array<{ oid: string; message: string; at: number }>> {
    try {
      const entries = await git.log({ fs, dir: this.root, gitdir: this.gitdir, depth })
      return entries.map((e) => ({ oid: e.oid, message: e.commit.message.trim(), at: e.commit.author.timestamp * 1000 }))
    } catch {
      return []
    }
  }
}
