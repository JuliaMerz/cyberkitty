import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import type { BookTree, DraftRequest, PageName, SceneFile, SceneSidecar, Settings } from '@shared/types'
import { Book, META } from './project'
import { History } from './history'
import { addSpend, getApiKey, getSpend, loadSettings, saveSettings, setApiKey } from './settings'
import { runDraft } from './writer'

const here = path.dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null
let book: Book | null = null
let history: History | null = null
let watcher: FSWatcher | null = null
/** What the app itself last wrote to each file, so the watcher can ignore our own writes. */
const lastWritten = new Map<string, string>()
const PAGES: PageName[] = ['style.md', 'book.md']
const drafts = new Map<string, AbortController>()
let settleTimer: NodeJS.Timeout | null = null

function send(channel: string, ...args: unknown[]): void {
  win?.webContents.send(channel, ...args)
}

async function openBook(dir: string): Promise<BookTree | null> {
  if (!(await Book.isBook(dir))) return null
  await watcher?.close()
  book = new Book(dir)
  history = new History(dir)
  lastWritten.clear()
  await saveSettings({ lastBook: dir })
  startWatching(book)
  void history.snapshot('Opened the book')
  return book.tree()
}

function startWatching(b: Book): void {
  const meta = path.join(b.root, META)
  watcher = watch(b.root, {
    ignoreInitial: true,
    ignored: (p) => p.startsWith(meta) || /(^|[/\\])\.(git|obsidian|trash)([/\\]|$)/.test(p) || p.endsWith('.tmp'),
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
  const onChange = async (abs: string): Promise<void> => {
    if (book !== b) return
    const hit = b.sceneForPath(abs)
    if (!hit) return
    let text: string | null = null
    try {
      text = await fs.readFile(abs, 'utf8')
    } catch {
      text = null
    }
    if (text !== null && lastWritten.get(abs) === text) return
    send('file-changed', { sceneId: hit.sceneId, file: hit.file, text })
  }
  const onTree = async (): Promise<void> => {
    if (book === b) send('book-changed', await b.tree())
  }
  watcher.on('change', onChange)
  watcher.on('add', (p) => void onChange(p).then(onTree))
  watcher.on('unlink', (p) => void onChange(p).then(onTree))
  watcher.on('addDir', () => void onTree())
  watcher.on('unlinkDir', () => void onTree())
}

function requireBook(): Book {
  if (!book) throw new Error('No book is open.')
  return book
}

async function scheduleSettle(): Promise<void> {
  const { settleSeconds } = await loadSettings()
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => void history?.snapshot('Work settled'), settleSeconds * 1000)
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => saveSettings(patch))
  ipcMain.handle('key:has', async () => Boolean(await getApiKey()))
  ipcMain.handle('key:set', (_e, key: string) => setApiKey(key))
  ipcMain.handle('spend:get', () => getSpend())

  ipcMain.handle('book:open-dialog', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Open a book folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = r.filePaths[0]
    if (!(await Book.isBook(dir))) {
      const answer = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['Make it a book', 'Cancel'],
        defaultId: 0,
        message: 'This folder is not a CyberKitty book yet.',
        detail: 'CyberKitty will add book.md, style.md and a manuscript folder. Nothing already there is changed.'
      })
      if (answer.response !== 0) return null
      await Book.create(dir, path.basename(dir))
    }
    return openBook(dir)
  })
  ipcMain.handle('book:create-dialog', async () => {
    const r = await dialog.showSaveDialog(win!, {
      title: 'Create a new book',
      buttonLabel: 'Create book',
      nameFieldLabel: 'Book title',
      defaultPath: path.join(app.getPath('documents'), 'Untitled book')
    })
    if (r.canceled || !r.filePath) return null
    await fs.mkdir(r.filePath, { recursive: true })
    await Book.create(r.filePath, path.basename(r.filePath))
    return openBook(r.filePath)
  })
  ipcMain.handle('book:open-sample', async () => {
    const target = path.join(app.getPath('documents'), 'CyberKitty sample - The Late Ferry')
    if (!(await Book.isBook(target))) {
      await fs.cp(sampleBookDir(), target, { recursive: true })
    }
    return openBook(target)
  })
  ipcMain.handle('book:open', (_e, dir: string) => openBook(dir))
  ipcMain.handle('book:get', async () => (book ? book.tree() : null))
  ipcMain.handle('book:create-chapter', async (_e, title: string) => {
    const b = requireBook()
    await b.createChapter(title)
    return b.tree()
  })
  ipcMain.handle('book:create-scene', async (_e, chapterId: string, title: string) => {
    const b = requireBook()
    const sceneId = await b.createScene(chapterId, title)
    return { tree: await b.tree(), sceneId }
  })

  ipcMain.handle('scene:read', async (_e, sceneId: string) => {
    const b = requireBook()
    const scene = await b.readScene(sceneId)
    if (scene.prose !== null) lastWritten.set(b.scenePath(sceneId, 'prose'), scene.prose)
    if (scene.notes !== null) lastWritten.set(b.scenePath(sceneId, 'notes'), scene.notes)
    return scene
  })
  ipcMain.handle('scene:write', async (_e, sceneId: string, file: SceneFile, text: string) => {
    const b = requireBook()
    lastWritten.set(b.scenePath(sceneId, file), text)
    await b.writeSceneFile(sceneId, file, text)
    void scheduleSettle()
  })
  ipcMain.handle('scene:write-sidecar', async (_e, sceneId: string, sidecar: SceneSidecar) => {
    await requireBook().writeSidecar(sceneId, sidecar)
    if (book) send('book-changed', await book.tree())
  })
  ipcMain.on('activity', () => void scheduleSettle())
  ipcMain.handle('page:read', async (_e, name: PageName) => {
    if (!PAGES.includes(name)) throw new Error(`Unknown page ${name}`)
    return (await requireBook().readText(name)) ?? ''
  })
  ipcMain.handle('page:write', async (_e, name: PageName, text: string) => {
    if (!PAGES.includes(name)) throw new Error(`Unknown page ${name}`)
    const b = requireBook()
    lastWritten.set(b.abs(name), text)
    await fs.writeFile(b.abs(name), text)
    void scheduleSettle()
  })

  ipcMain.handle('draft:start', async (_e, req: DraftRequest) => {
    const b = requireBook()
    const jobId = `draft-${Date.now().toString(36)}`
    const ctrl = new AbortController()
    drafts.set(jobId, ctrl)
    const lane = (await loadSettings()).lanes.writer
    void (async () => {
      await history?.snapshot('Before Claude drafted')
      const result = await runDraft(b, req, lane, ctrl.signal, (delta) => send('draft-delta', jobId, delta))
      drafts.delete(jobId)
      if (result.costUsd) send('spend', await addSpend(result.costUsd))
      const { text: _text, ...rest } = result
      send('draft-done', jobId, rest)
    })()
    return jobId
  })
  ipcMain.on('draft:cancel', (_e, jobId: string) => drafts.get(jobId)?.abort())
}

function sampleBookDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'sample-book')
    : path.join(app.getAppPath(), 'resources', 'sample-book')
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'CyberKitty',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  // Links open in the browser; the app never navigates away from itself.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(path.join(here, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  registerIpc()
  const bookArg = process.env.CYBERKITTY_BOOK
  const settings = await loadSettings()
  const initial = bookArg ?? settings.lastBook
  if (initial) await openBook(initial).catch(() => null)
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  void history?.snapshot('Closed the book')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
