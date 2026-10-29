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
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
})
