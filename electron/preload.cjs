const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('stillpage', {
  platform: process.platform,
  takePendingFiles: () => ipcRenderer.invoke('take-pending-files'),
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files)
    ipcRenderer.on('open-files', listener)
    return () => ipcRenderer.removeListener('open-files', listener)
  },
  spotifyAuth: (url) => ipcRenderer.invoke('spotify-auth', url),
  spotifyWeb: {
    status: () => ipcRenderer.invoke('spotify-web-status'),
    login: () => ipcRenderer.invoke('spotify-web-login'),
    logout: () => ipcRenderer.invoke('spotify-web-logout'),
  },
  drmStatus: () => ipcRenderer.invoke('drm-status'),
  spanScreens: (on) => ipcRenderer.invoke('span-screens', on),
  screenInfo: () => ipcRenderer.invoke('screen-info'),
  onSpanChanged: (callback) => {
    const listener = (_event, spanned) => callback(spanned)
    ipcRenderer.on('span-changed', listener)
    return () => ipcRenderer.removeListener('span-changed', listener)
  },
  exportPdf: (name, html) => ipcRenderer.invoke('export-pdf', name, html),
  saveFile: (name, text) => ipcRenderer.invoke('save-file', name, text),
  showInFolder: (file) => ipcRenderer.invoke('show-in-folder', file),
  officeStatus: () => ipcRenderer.invoke('office-status'),
  convertToPdf: (name, data) => ipcRenderer.invoke('convert-to-pdf', name, data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pathForFile: (file) => webUtils.getPathForFile(file),
  readTextFile: (file) => ipcRenderer.invoke('read-text-file', file),
  writeTextFile: (file, text, expectedMtime, force) => ipcRenderer.invoke('write-text-file', file, text, expectedMtime, force),
  statFile: (file) => ipcRenderer.invoke('stat-file', file),
  readFiles: (files) => ipcRenderer.invoke('read-files', files),
})
