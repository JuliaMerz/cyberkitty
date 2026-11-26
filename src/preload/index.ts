import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CkApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CkApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  hasApiKey: () => ipcRenderer.invoke('key:has'),
  setApiKey: (key) => ipcRenderer.invoke('key:set', key),
  getSpend: () => ipcRenderer.invoke('spend:get'),

  openBookDialog: () => ipcRenderer.invoke('book:open-dialog'),
  createBookDialog: () => ipcRenderer.invoke('book:create-dialog'),
  openSampleBook: () => ipcRenderer.invoke('book:open-sample'),
  openBook: (p) => ipcRenderer.invoke('book:open', p),
  getBook: () => ipcRenderer.invoke('book:get'),
  createChapter: (title) => ipcRenderer.invoke('book:create-chapter', title),
  createScene: (chapterId, title) => ipcRenderer.invoke('book:create-scene', chapterId, title),

  readScene: (id) => ipcRenderer.invoke('scene:read', id),
  writeSceneFile: (id, file, text) => ipcRenderer.invoke('scene:write', id, file, text),
  writeSidecar: (id, sidecar) => ipcRenderer.invoke('scene:write-sidecar', id, sidecar),
  noteActivity: () => ipcRenderer.send('activity'),
  readPage: (name) => ipcRenderer.invoke('page:read', name),
  writePage: (name, text) => ipcRenderer.invoke('page:write', name, text),

  draft: (req) => ipcRenderer.invoke('draft:start', req),
  cancelDraft: (jobId) => ipcRenderer.send('draft:cancel', jobId),
  onDraftDelta: (cb) => listen('draft-delta', cb),
  onDraftDone: (cb) => listen('draft-done', cb),
  onFileChanged: (cb) => listen('file-changed', cb),
  onBookChanged: (cb) => listen('book-changed', cb),
  onSpend: (cb) => listen('spend', cb)
}

contextBridge.exposeInMainWorld('ck', api)
