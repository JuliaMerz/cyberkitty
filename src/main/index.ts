import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import { docKey, type AlternativesRequest, type BibleEntry, type BookTree, type ChangeSpec, type Correction, type DocRef, type DraftRequest, type HunkDecision, type MarkRecord, type PassageRef, type Place, type RewriteRequest, type Settings, type ToolResult } from '@shared/types'
import { firstHeading } from '@shared/notes'
import { BIBLE_DIR } from '@shared/biblemd'
import { Book, META } from './project'
import { History } from './history'
import { getApiKey, getSpend, loadSettings, saveSettings, setApiKey } from './settings'
import { alternatives, ghostText, rewrite, runDraft } from './writer'
import { canCall, describeError, setSpendListener } from './gateway'
import { flushUi, send, state, uiFlushed } from './state'
import { alertStore, bibleStore, changeStore, chatStore, diagramStore, logCorrection, summaryStore } from './stores'
import { resetPlanner, sendChat, stopChat } from './planner'
import { resetSnapshots } from './snapshot'
import { logAction, logChanges, logEvent, resetLog } from './eventlog'
import { draftJobs, HANDLED, SENT, sceneTitle } from './actions'
import { deleteEntry, saveEntry } from './bible'
import { addTodo, refreshAlerts, setAlertStatus } from './alerts'
import { settle } from './settling'
import { scan } from './scan'
import { mergeChange, proposeChange, runChange, saveChange, undoChange } from './changes'
import { drawDiagram } from './diagrams'
import { EXPORT_NAMES, exportMarkdown, type ExportKind } from './export'

const here = path.dirname(fileURLToPath(import.meta.url))

let watcher: FSWatcher | null = null
const drafts = new Map<string, AbortController>()
let settleTimer: NodeJS.Timeout | null = null
let scanTimer: NodeJS.Timeout | null = null
let treeTimer: NodeJS.Timeout | null = null
let lastChapter: string | null = null

async function treeWithCounts(b: Book): Promise<BookTree> {
  const tree = await b.tree()
  let open = 0
  let diverged = 0
  try {
    const alerts = await alertStore.read()
    open = alerts.filter((a) => a.status === 'open').length
    diverged = alerts.filter((a) => a.status === 'open' && a.kind === 'diverged').length
  } catch {
    // no alerts yet
  }
  return { ...tree, openAlerts: open, divergedOutline: diverged }
}

/** Debounced: tell the UI the tree changed (counts, new files). */
function refreshTree(): void {
  if (treeTimer) clearTimeout(treeTimer)
  treeTimer = setTimeout(async () => {
    const b = state.book
    if (b) send('book-changed', await treeWithCounts(b))
  }, 120)
}
state.onDirty = refreshTree

async function openBook(dir: string): Promise<BookTree | null> {
  if (!(await Book.isBook(dir))) return null
  // Typing still held back in the UI belongs to the book that is open now.
  await flushUi()
  await watcher?.close()
  resetPlanner()
  resetSnapshots()
  resetLog()
  state.book = new Book(dir)
  state.history = new History(dir)
  state.lastWritten.clear()
  state.openDocs.clear()
  lastChapter = null
  await saveSettings({ lastBook: dir })
  startWatching(state.book)
  // Write the bible's Markdown files (books from before them get them now).
  await bibleStore.update((all) => all).catch(() => undefined)
  void state.history.snapshot('Opened the book')
  return treeWithCounts(state.book)
}

function startWatching(b: Book): void {
  const meta = path.join(b.root, META)
  watcher = watch(b.root, {
    ignoreInitial: true,
    ignored: (p) => p.startsWith(meta) || /(^|[/\\])\.(git|obsidian|trash)([/\\]|$)/.test(p) || p.endsWith('.tmp'),
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
  const onChange = async (abs: string): Promise<void> => {
    if (state.book !== b) return
    // The bible's files: the Bible page rereads them, which takes in the edit.
    if (path.relative(b.root, abs).split(path.sep)[0] === BIBLE_DIR) {
      send('data-changed', 'bible')
      scheduleSettle()
      return
    }
    const ref = b.refForPath(abs)
    if (!ref) return
    let text: string | null = null
    try {
      text = await fs.readFile(abs, 'utf8')
    } catch {
      text = null
    }
    if (text !== null && state.lastWritten.get(abs) === text) return
    if (text !== null) state.lastWritten.set(abs, text)
    send('file-changed', { key: docKey(ref), text })
    scheduleSettle()
  }
  watcher.on('change', (p) => void onChange(p))
  watcher.on('add', (p) => void onChange(p).then(refreshTree))
  watcher.on('unlink', (p) => void onChange(p).then(refreshTree))
  watcher.on('addDir', refreshTree)
  watcher.on('unlinkDir', refreshTree)
}

function requireBook(): Book {
  if (!state.book) throw new Error('No book is open.')
  return state.book
}

/**
 * Work settles when the author pauses. Then the book is snapshotted and Claude
 * catches up in the background (summaries, bible, outline, direction).
 */
async function scheduleSettleAsync(): Promise<void> {
  const s = await loadSettings()
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    void (async () => {
      if (!state.book) return
      await state.history?.snapshot('Work settled')
      if (await canCall()) await settle().catch(() => undefined)
      else await refreshAlerts().catch(() => undefined)
    })()
  }, s.settleSeconds * 1000)
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = setTimeout(() => {
    if (state.book) void canCall().then((k) => { if (k) void scan() })
  }, s.scanIdleMinutes * 60 * 1000)
}
function scheduleSettle(): void {
  void scheduleSettleAsync()
}

function noteActivity(place: Place): void {
  state.place = place
  state.lastActivity = Date.now()
  // Leaving a chapter is a natural moment to read the whole book.
  if (place.chapterId && lastChapter && place.chapterId !== lastChapter) {
    void canCall().then((k) => { if (k) void scan() })
  }
  if (place.chapterId) lastChapter = place.chapterId
  scheduleSettle()
}

async function tool<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

/** Bring in Markdown written elsewhere: each file becomes a scene of prose. */
async function importMarkdown(chapterId: string): Promise<BookTree | null> {
  const b = requireBook()
  const r = await dialog.showOpenDialog(state.win!, {
    title: 'Import Markdown as scenes',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
  })
  if (r.canceled || !r.filePaths.length) return null
  for (const file of r.filePaths.sort()) {
    const text = await fs.readFile(file, 'utf8')
    const title = firstHeading(text) ?? path.basename(file).replace(/\.(md|markdown|txt)$/i, '').replace(/^\d+[-_ ]*/, '')
    const prose = /^\s*#\s/.test(text) ? text : `# ${title}\n\n${text}`
    await b.createScene(chapterId, title, `# ${title}\n\n`, prose)
  }
  void state.history?.snapshot('Imported Markdown')
  return treeWithCounts(b)
}

async function openBookDialog(): Promise<BookTree | null> {
  const r = await dialog.showOpenDialog(state.win!, { title: 'Open a book folder', properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  const dir = r.filePaths[0]
  if (!(await Book.isBook(dir))) {
    const answer = await dialog.showMessageBox(state.win!, {
      type: 'question',
      buttons: ['Make it a book', 'Cancel'],
      defaultId: 0,
      message: 'This folder is not a CyberKitty book yet.',
      detail: 'CyberKitty will add the book pages and a manuscript folder. Nothing already there is changed.'
    })
    if (answer.response !== 0) return null
    await Book.create(dir, path.basename(dir))
  }
  return openBook(dir)
}

async function createBookDialog(): Promise<BookTree | null> {
  const r = await dialog.showSaveDialog(state.win!, {
    title: 'Create a new book',
    buttonLabel: 'Create book',
    nameFieldLabel: 'Book title',
    defaultPath: path.join(app.getPath('documents'), 'Untitled book')
  })
  if (r.canceled || !r.filePath) return null
  await fs.mkdir(r.filePath, { recursive: true })
  await Book.create(r.filePath, path.basename(r.filePath))
  return openBook(r.filePath)
}

async function openSample(): Promise<BookTree | null> {
  const target = path.join(app.getPath('documents'), 'CyberKitty sample - The Late Ferry')
  if (!(await Book.isBook(target))) await fs.cp(sampleBookDir(), target, { recursive: true })
  return openBook(target)
}

/** Save the book as one Markdown file of the given kind, where the author picks. */
async function exportBook(kind: ExportKind): Promise<void> {
  const b = state.book
  if (!b || !state.win) return
  await flushUi()
  const name = `${(await b.title()).replace(/[\\/:*?"<>|]/g, '').trim() || 'Book'} - ${EXPORT_NAMES[kind]}.md`
  // Tests write straight into a folder instead of asking.
  const dir = process.env.CYBERKITTY_EXPORT_DIR
  const target = dir
    ? path.join(dir, name)
    : (
        await dialog.showSaveDialog(state.win, {
          title: `Export the ${EXPORT_NAMES[kind]}`,
          defaultPath: path.join(app.getPath('documents'), name),
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        })
      ).filePath
  if (!target) return
  await fs.writeFile(target, await exportMarkdown(b, kind))
  if (!dir) shell.showItemInFolder(target)
}

/** The app menu. Book-level items run here; items that need the page are sent to the UI. */
function buildMenu(): void {
  const opened = (p: Promise<BookTree | null>): void => {
    void p.then((t) => t && send('book-opened', t))
  }
  const ui = (cmd: string) => () => send('menu', cmd)
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Book…', accelerator: 'CmdOrCtrl+Shift+N', click: () => opened(createBookDialog()) },
        { label: 'New Chapter…', accelerator: 'CmdOrCtrl+Alt+N', click: ui('new-chapter') },
        { label: 'New Scene…', accelerator: 'CmdOrCtrl+N', click: ui('new-scene') },
        { type: 'separator' },
        { label: 'Open Book…', accelerator: 'CmdOrCtrl+O', click: () => opened(openBookDialog()) },
        { label: 'Open the Sample Book', click: () => opened(openSample()) },
        { label: 'Import Markdown as Scenes…', click: ui('import') },
        {
          label: 'Export as Markdown',
          submenu: [
            { label: 'Manuscript…', click: () => void exportBook('manuscript') },
            { label: 'Notes and Planning…', click: () => void exportBook('notes') },
            { label: 'Story Bible…', click: () => void exportBook('bible') }
          ]
        },
        { label: 'Close Book', click: ui('close-book') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: ui('settings') },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Chat', accelerator: 'CmdOrCtrl+Shift+L', click: ui('toggle-chat') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }])
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Register a channel the UI invokes. Every one goes through the action table
 * (actions.ts): save the UI's held-back typing, log the edits before the
 * action and then the action, run it, and log what it changed or that it
 * failed. A channel missing from the table does not start.
 */
function handle<A extends unknown[]>(channel: string, fn: (...args: A) => unknown): void {
  const entry = HANDLED[channel]
  if (!entry) throw new Error(`${channel} is not in the action table (src/main/actions.ts)`)
  ipcMain.handle(channel, async (_e, ...args: unknown[]) => {
    if (entry.flush) await flushUi()
    const text = entry.log && state.book ? await (entry.log as (...a: unknown[]) => string | null | Promise<string | null>)(...args) : null
    if (text) await logAction('author', text)
    try {
      const result = await fn(...(args as A))
      if (text && result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        logEvent('app', `That request failed: ${(result as { error?: string }).error ?? 'no reason given'}`, { kind: 'error' })
      }
      return result
    } catch (err) {
      if (text) logEvent('app', `That request failed: ${describeError(err)}`, { kind: 'error' })
      throw err
    } finally {
      // What the action changed follows it in the log.
      if (text) void logChanges()
    }
  })
}

/** Register a channel the UI sends to without waiting, through the same table. */
function on<A extends unknown[]>(channel: string, fn: (...args: A) => void): void {
  const entry = SENT[channel]
  if (!entry) throw new Error(`${channel} is not in the action table (src/main/actions.ts)`)
  ipcMain.on(channel, (_e, ...args: unknown[]) => {
    if (entry.log && state.book) {
      const text = (entry.log as (...a: unknown[]) => string | null)(...args)
      if (text) void logAction('author', text)
    }
    fn(...(args as A))
  })
}

function registerIpc(): void {
  handle('settings:get', () => loadSettings())
  handle('settings:set', async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch)
    if (patch.blockingHelp || patch.lanes) resetPlanner()
    return next
  })
  handle('key:has', async () => Boolean(await getApiKey()))
  handle('key:set', (key: string) => setApiKey(key))
  handle('spend:get', () => getSpend())

  handle('book:open-dialog', () => openBookDialog())
  handle('book:create-dialog', () => createBookDialog())
  handle('book:open-sample', () => openSample())
  handle('book:close', async () => {
    await logChanges()
    await state.history?.snapshot('Closed the book')
    await watcher?.close()
    watcher = null
    resetPlanner()
    resetSnapshots()
    resetLog()
    state.book = null
    state.history = null
    state.openDocs.clear()
    await saveSettings({ lastBook: null })
  })
  handle('book:import', (chapterId: string) => importMarkdown(chapterId))
  handle('book:open', (dir: string) => openBook(dir))
  handle('book:get', async () => (state.book ? treeWithCounts(state.book) : null))
  handle('book:create-chapter', async (title: string) => {
    const b = requireBook()
    await b.createChapter(title)
    return treeWithCounts(b)
  })
  handle('book:create-scene', async (chapterId: string, title: string) => {
    const b = requireBook()
    const sceneId = await b.createScene(chapterId, title)
    return { tree: await treeWithCounts(b), sceneId }
  })
  handle('book:rename-scene', async (sceneId: string, title: string) => {
    const b = requireBook()
    await b.renameScene(sceneId, title)
    for (const file of ['prose', 'notes'] as const) {
      const ref: DocRef = { kind: 'scene', sceneId, file }
      const text = await b.readText(path.relative(b.root, b.docPath(ref)))
      if (text !== null) {
        state.lastWritten.set(b.docPath(ref), text)
        if (state.openDocs.has(docKey(ref))) send('file-changed', { key: docKey(ref), text })
      }
    }
    return treeWithCounts(b)
  })

  handle('doc:read', async (ref: DocRef) => {
    const b = requireBook()
    const doc = await b.readDoc(ref)
    if (doc.text !== null) state.lastWritten.set(b.docPath(ref), doc.text)
    return doc
  })
  handle('doc:write', async (ref: DocRef, text: string) => {
    const b = requireBook()
    state.lastWritten.set(b.docPath(ref), text)
    await b.writeDoc(ref, text)
    scheduleSettle()
  })
  handle('doc:write-marks', async (ref: DocRef, marks: MarkRecord[]) => {
    await requireBook().writeDocMarks(ref, marks)
    refreshTree()
  })
  on('doc:open-docs', (keys: string[]) => {
    state.openDocs = new Set(keys)
  })
  on('activity', (place: Place) => noteActivity(place))
  on('correction', (c: Correction) => {
    if (state.book) void logCorrection(c)
  })

  handle('draft:start', async (req: DraftRequest) => {
    const jobId = `draft-${Date.now().toString(36)}`
    const ctrl = new AbortController()
    drafts.set(jobId, ctrl)
    const lane = (await loadSettings()).lanes.writer
    const scene = `“${await sceneTitle(req.sceneId)}” (${req.sceneId})`
    draftJobs.set(jobId, scene)
    void (async () => {
      await state.history?.snapshot('Before Claude drafted')
      const result = await runDraft(req, lane, ctrl.signal, (delta) => send('draft-delta', jobId, delta))
      drafts.delete(jobId)
      draftJobs.delete(jobId)
      // A stop is logged by draft:cancel; anything else that ends a draft early is a failure.
      if (!result.ok && !ctrl.signal.aborted) logEvent('app', `The draft in ${scene} failed: ${result.error ?? 'no reason given'}. What was written so far stays in the prose.`, { kind: 'error' })
      const { text: _text, ...rest } = result
      send('draft-done', jobId, rest)
    })()
    return jobId
  })
  on('draft:cancel', (jobId: string) => drafts.get(jobId)?.abort())
  handle('tool:alternatives', (req: AlternativesRequest) => tool(() => alternatives(req)))
  handle('tool:rewrite', (req: RewriteRequest) => tool(() => rewrite(req)))
  handle('tool:ghost', (req: { sceneId: string; before: string }) => tool(() => ghostText(req.sceneId, req.before)))

  handle('chat:get', async () => (state.book ? chatStore.read() : []))
  handle('chat:send', (text: string, place: Place, passages: PassageRef[]) => sendChat(text, place, passages))
  on('chat:stop', () => stopChat())
  on('editors-flushed', (id: number) => uiFlushed(id))

  handle('bible:get', async () => (state.book ? bibleStore.read() : []))
  handle('bible:save', (entry: BibleEntry) => saveEntry(entry))
  handle('bible:delete', (id: string) => deleteEntry(id))
  handle('summaries:get', async () => (state.book ? summaryStore.read() : {}))
  handle('summaries:seen', async (sceneId: string) => {
    await summaryStore.update((all) => (all[sceneId]?.changed.length ? { ...all, [sceneId]: { ...all[sceneId], changed: [] } } : all))
  })
  handle('settle:now', async () => {
    await state.history?.snapshot('Work settled')
    await settle()
  })
  handle('diagrams:get', async () => (state.book ? diagramStore.read() : []))
  handle('diagrams:draw', (request: string) => tool(() => drawDiagram(request)))
  handle('diagrams:delete', async (id: string) => {
    await diagramStore.update((all) => all.filter((d) => d.id !== id))
  })

  handle('alerts:get', async () => (state.book ? alertStore.read() : []))
  handle('alerts:status', async (id: string, status: 'open' | 'dismissed' | 'done') => {
    await setAlertStatus(id, status)
    refreshTree()
  })
  handle('alerts:todo', async (text: string, sceneId?: string) => {
    await addTodo(text, sceneId)
    refreshTree()
  })
  handle('alerts:scan', () => scan({ force: true }))

  handle('changes:get', async () => (state.book ? changeStore.read() : []))
  handle('changes:propose', (chapterId: string, request: string) => tool(() => proposeChange(chapterId, request)))
  handle('changes:save', (change: ChangeSpec) => saveChange(change))
  handle('changes:run', (id: string) => runChange(id))
  handle('changes:merge', (id: string, decisions: HunkDecision[]) => mergeChange(id, decisions))
  handle('changes:undo', (id: string) => undoChange(id))

  handle('history:get', async () => (state.history ? state.history.log(100) : []))
  handle('history:restore', async (oid: string) => {
    const b = requireBook()
    const h = state.history
    if (!h) return
    const touched = await h.restore(oid)
    for (const rel of touched) {
      const abs = b.abs(rel)
      const ref = b.refForPath(abs)
      if (!ref) continue
      const text = await b.readText(rel)
      if (text !== null) state.lastWritten.set(abs, text)
      send('file-changed', { key: docKey(ref), text })
    }
    send('data-changed', 'history')
    refreshTree()
  })
}

function sampleBookDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'sample-book') : path.join(app.getAppPath(), 'resources', 'sample-book')
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
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
  state.win = win
  // Links open in the browser; the app never navigates away from itself.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  // Closing waits for the UI to save the typing it is still holding back, so
  // the last words before a quit are never lost; then the book is snapshotted.
  let saved = false
  win.on('close', (e) => {
    if (saved) return
    e.preventDefault()
    saved = true
    void flushUi()
      .then(() => state.history?.snapshot('Closed the book'))
      .catch(() => undefined)
      .finally(() => {
        if (!win.isDestroyed()) win.close()
        if (quitting) app.quit()
      })
  })

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(path.join(here, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  registerIpc()
  buildMenu()
  setSpendListener((s) => send('spend', s))
  const settings = await loadSettings()
  const initial = process.env.CYBERKITTY_BOOK ?? settings.lastBook
  if (initial) await openBook(initial).catch(() => null)
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

let quitting = false
app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

