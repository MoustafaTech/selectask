'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selectask', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  ask: (messages) => ipcRenderer.invoke('ask', messages),
  stop: () => ipcRenderer.send('stop'),
  close: () => ipcRenderer.send('close-popup'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onSession: (fn) => ipcRenderer.on('session', (_e, payload) => fn(payload)),
  onChunk: (fn) => ipcRenderer.on('chunk', (_e, delta) => fn(delta)),
  onDone: (fn) => ipcRenderer.on('done', () => fn()),
  onError: (fn) => ipcRenderer.on('stream-error', (_e, msg) => fn(msg))
});
