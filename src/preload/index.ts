import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CkApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const inv = ipcRenderer.invoke.bind(ipcRenderer)

const api: CkApi = {
  getSettings: () => inv('settings:get'),
  setSettings: (patch) => inv('settings:set', patch),
  hasApiKey: () => inv('key:has'),
  setApiKey: (key) => inv('key:set', key),
  getSpend: () => inv('spend:get'),

  openBookDialog: () => inv('book:open-dialog'),
  createBookDialog: () => inv('book:create-dialog'),
  openSampleBook: () => inv('book:open-sample'),
  importMarkdownDialog: (chapterId) => inv('book:import', chapterId),
  openBook: (p) => inv('book:open', p),
  closeBook: () => inv('book:close'),
  getBook: () => inv('book:get'),
  createChapter: (title) => inv('book:create-chapter', title),
  createScene: (chapterId, title) => inv('book:create-scene', chapterId, title),
  renameScene: (sceneId, title) => inv('book:rename-scene', sceneId, title),
  createNote: (title, place) => inv('book:create-note', title, place),
  moveNote: (noteId, place) => inv('book:move-note', noteId, place),
  noteToScene: (noteId) => inv('book:note-to-scene', noteId),
  sceneToNote: (sceneId) => inv('book:scene-to-note', sceneId),

  readDoc: (ref) => inv('doc:read', ref),
  writeDoc: (ref, text) => inv('doc:write', ref, text),
  writeDocMarks: (ref, marks) => inv('doc:write-marks', ref, marks),
  setOpenDocs: (keys) => ipcRenderer.send('doc:open-docs', keys),
  noteActivity: (place) => ipcRenderer.send('activity', place),
  logCorrection: (c) => ipcRenderer.send('correction', c),

  draft: (req) => inv('draft:start', req),
  cancelDraft: (jobId) => ipcRenderer.send('draft:cancel', jobId),
  detachDraft: (jobId, text, start, pos) => ipcRenderer.send('draft:detach', jobId, text, start, pos),
  alternatives: (req) => inv('tool:alternatives', req),
  rewrite: (req) => inv('tool:rewrite', req),
  ghostText: (req) => inv('tool:ghost', req),

  getChat: () => inv('chat:get'),
  sendChat: (text, place, passages) => inv('chat:send', text, place, passages),
  stopChat: () => ipcRenderer.send('chat:stop'),

  getBible: () => inv('bible:get'),
  saveBibleEntry: (e) => inv('bible:save', e),
  deleteBibleEntry: (id) => inv('bible:delete', id),
  getSummaries: () => inv('summaries:get'),
  markSummarySeen: (id) => inv('summaries:seen', id),
  settleNow: () => inv('settle:now'),
  getDiagrams: () => inv('diagrams:get'),
  drawDiagram: (r) => inv('diagrams:draw', r),
  deleteDiagram: (id) => inv('diagrams:delete', id),

  getAlerts: () => inv('alerts:get'),
  setAlertStatus: (id, status) => inv('alerts:status', id, status),
  addTodo: (text, sceneId) => inv('alerts:todo', text, sceneId),
  scanNow: () => inv('alerts:scan'),

  getChanges: () => inv('changes:get'),
  proposeChange: (chapterId, request) => inv('changes:propose', chapterId, request),
  saveChange: (c) => inv('changes:save', c),
  runChange: (id) => inv('changes:run', id),
  mergeChange: (id, d) => inv('changes:merge', id, d),
  undoChange: (id) => inv('changes:undo', id),

  getHistory: () => inv('history:get'),
  restore: (oid) => inv('history:restore', oid),

  onDraftDelta: (cb) => listen('draft-delta', cb),
  onDraftDone: (cb) => listen('draft-done', cb),
  onFileChanged: (cb) => listen('file-changed', cb),
  onMarksAdded: (cb) => listen('marks-added', cb),
  onMarksRemoved: (cb) => listen('marks-removed', cb),
  onBookChanged: (cb) => listen('book-changed', cb),
  onSpend: (cb) => listen('spend', cb),
  onChat: (cb) => listen('chat', cb),
  onDataChanged: (cb) => listen('data-changed', cb),
  onJob: (cb) => listen('job', cb),
  onNavigate: (cb) => listen('navigate', cb),
  onBookOpened: (cb) => listen('book-opened', cb),
  onMenu: (cb) => listen('menu', cb),
  onFlushEditors: (cb) => listen('flush-editors', cb),
  editorsFlushed: (id) => ipcRenderer.send('editors-flushed', id)
}

contextBridge.exposeInMainWorld('ck', api)
