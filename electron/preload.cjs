const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stillpage', {
  platform: process.platform,
  takePendingFiles: () => ipcRenderer.invoke('take-pending-files'),
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files)
    ipcRenderer.on('open-files', listener)
    return () => ipcRenderer.removeListener('open-files', listener)
  },
  spotifyAuth: (url) => ipcRenderer.invoke('spotify-auth', url),
  drmStatus: () => ipcRenderer.invoke('drm-status'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
})
