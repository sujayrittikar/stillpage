// Stillpage — Electron main process.
// Serves the built renderer over a privileged app:// scheme, handles "Open with"
// from the file manager, and runs the Spotify login in a child window.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, screen, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DEV_URL = process.env.STILLPAGE_DEV_URL
const DIST = path.join(__dirname, '..', 'dist')
const SPOTIFY_REDIRECT = 'http://127.0.0.1:43117/callback'
const MAX_FILE_BYTES = 512 * 1024 * 1024
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://sdk.scdn.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://api.spotify.com https://accounts.spotify.com",
  "frame-src https://sdk.scdn.co https://open.spotify.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

// GNOME and KDE on Wayland never let an app place or size its own window
// across monitors, so "Span screens" could not work there. XWayland can, and
// at 100% scaling it looks the same. Set STILLPAGE_WAYLAND=1 to opt out.
if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && !process.env.STILLPAGE_WAYLAND) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

/** @type {BrowserWindow | null} */
let win = null
/** Files requested before the renderer was ready to receive them. */
let pendingPaths = []
let rendererReady = false

function filesFromArgv(argv) {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-') && arg !== '.')
    .map((arg) => path.resolve(arg))
    .filter((p) => {
      try {
        const s = fs.statSync(p)
        return s.isFile() && s.size <= MAX_FILE_BYTES
      } catch {
        return false
      }
    })
}

function readFiles(paths) {
  return paths.map((p) => ({ name: path.basename(p), data: fs.readFileSync(p), lastModified: fs.statSync(p).mtimeMs }))
}

function openPaths(paths) {
  if (!paths.length) return
  if (win && rendererReady) win.webContents.send('open-files', readFiles(paths))
  else pendingPaths.push(...paths)
}

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json')
/** Bounds to return to when the window stops spanning. */
let restoreBounds = null

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'))
  } catch {
    return {}
  }
}

function writeState(patch) {
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...readState(), ...patch }))
  } catch {}
}

/** The rectangle covering every monitor's usable area, left to right. */
function allScreens() {
  const areas = screen.getAllDisplays().map((d) => d.workArea)
  const left = Math.min(...areas.map((a) => a.x))
  const top = Math.max(...areas.map((a) => a.y))
  const right = Math.max(...areas.map((a) => a.x + a.width))
  const bottom = Math.min(...areas.map((a) => a.y + a.height))
  return { bounds: { x: left, y: top, width: right - left, height: Math.max(420, bottom - top) }, areas }
}

function isSpanned() {
  return restoreBounds !== null
}

/** Stretch the window over all monitors, or put it back. Returns where the
 *  monitor edges fall, as fractions of the window width, so panes can line up. */
function setSpanned(on) {
  if (!win) return { spanned: false, seams: [] }
  const displays = screen.getAllDisplays()
  if (on && displays.length > 1) {
    if (!isSpanned()) restoreBounds = win.isMaximized() || win.isFullScreen() ? null : win.getBounds()
    restoreBounds ??= { width: 1440, height: 920 }
    if (win.isFullScreen()) win.setFullScreen(false)
    if (win.isMaximized()) win.unmaximize()
    const { bounds, areas } = allScreens()
    win.setBounds(bounds)
    writeState({ spanned: true })
    const seams = areas
      .map((a) => a.x + a.width)
      .filter((edge) => edge < bounds.x + bounds.width)
      .sort((a, b) => a - b)
      .map((edge) => (edge - bounds.x) / bounds.width)
    return { spanned: true, seams }
  }
  if (isSpanned()) {
    const back = restoreBounds
    restoreBounds = null
    if (back.x === undefined) win.setBounds({ ...back, ...centre(back) })
    else win.setBounds(back)
  }
  writeState({ spanned: false })
  return { spanned: false, seams: [] }
}

function centre({ width, height }) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2) }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 640,
    minHeight: 420,
    title: 'Stillpage',
    backgroundColor: '#E9ECE6',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  // Links inside documents open in the system browser, never inside the reader.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('app://')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      win?.webContents.toggleDevTools()
    }
  })
  win.on('closed', () => {
    win = null
    restoreBounds = null
    rendererReady = false
  })

  win.loadURL(DEV_URL || 'app://stillpage/index.html')
  if (readState().spanned) {
    win.once('ready-to-show', () => win?.webContents.send('span-changed', setSpanned(true).spanned))
  }
  // Maximizing from the title bar means the person chose one screen again.
  win.on('maximize', () => {
    if (!isSpanned()) return
    restoreBounds = null
    writeState({ spanned: false })
    win?.webContents.send('span-changed', false)
  })
}

function spotifyLogin(authorizeUrl) {
  return new Promise((resolve) => {
    let settled = false
    const auth = new BrowserWindow({
      parent: win ?? undefined,
      modal: true,
      width: 480,
      height: 720,
      title: 'Connect Spotify',
      autoHideMenuBar: true,
      webPreferences: { partition: 'persist:spotify-auth', contextIsolation: true, sandbox: true },
    })
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
      if (!auth.isDestroyed()) auth.close()
    }
    const intercept = (event, url) => {
      if (url.startsWith(SPOTIFY_REDIRECT)) {
        event.preventDefault()
        finish(url)
      }
    }
    auth.webContents.on('will-redirect', intercept)
    auth.webContents.on('will-navigate', intercept)
    auth.on('closed', () => finish(null))
    auth.loadURL(authorizeUrl)
  })
}

// Signing in to open.spotify.com in the app's own session lets the pasted-link
// player play whole songs instead of 30-second previews. No developer app needed.
const SPOTIFY_WEB_LOGIN = 'https://accounts.spotify.com/login?continue=' + encodeURIComponent('https://open.spotify.com/')

async function spotifyWebSignedIn() {
  const cookies = await session.defaultSession.cookies.get({ name: 'sp_dc' })
  return cookies.some((c) => c.domain?.endsWith('spotify.com'))
}

function spotifyWebLogin() {
  return new Promise((resolve) => {
    let settled = false
    const login = new BrowserWindow({
      parent: win ?? undefined,
      modal: true,
      width: 480,
      height: 720,
      title: 'Sign in to Spotify',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    })
    const finish = async () => {
      if (settled) return
      settled = true
      if (!login.isDestroyed()) login.close()
      resolve(await spotifyWebSignedIn())
    }
    // Once Spotify sends the window on to the web player, the sign-in is done.
    login.webContents.on('did-navigate', (_event, url) => {
      if (url.startsWith('https://open.spotify.com')) void finish()
    })
    login.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    login.on('closed', () => void finish())
    login.loadURL(SPOTIFY_WEB_LOGIN)
  })
}

ipcMain.handle('spotify-web-status', () => spotifyWebSignedIn())
ipcMain.handle('spotify-web-login', () => spotifyWebLogin())
ipcMain.handle('spotify-web-logout', async () => {
  const cookies = await session.defaultSession.cookies.get({})
  await Promise.all(
    cookies
      .filter((c) => c.domain?.replace(/^\./, '').endsWith('spotify.com'))
      .map((c) => session.defaultSession.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name)),
  )
  return false
})

ipcMain.handle('take-pending-files', () => {
  rendererReady = true
  const paths = pendingPaths
  pendingPaths = []
  return readFiles(paths)
})
ipcMain.handle('spotify-auth', (_event, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://accounts.spotify.com/')) return null
  return spotifyLogin(url)
})
ipcMain.handle('drm-status', async () => {
  try {
    const { components } = require('electron')
    if (!components) return 'unavailable'
    await components.whenReady()
    return 'ready'
  } catch {
    return 'unavailable'
  }
})
ipcMain.handle('span-screens', (_event, on) => setSpanned(on === undefined ? !isSpanned() : Boolean(on)))
ipcMain.handle('screen-info', () => ({ count: screen.getAllDisplays().length, spanned: isSpanned() }))
ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url)
})

app.on('second-instance', (_event, argv) => {
  openPaths(filesFromArgv(argv))
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  protocol.handle('app', async (request) => {
    let pathname = decodeURIComponent(new URL(request.url).pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const file = path.normalize(path.join(DIST, pathname))
    if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(file).toString())
    if (!file.endsWith('.html')) return response
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(response.body, { status: response.status, headers })
  })

  // castlabs Electron ships Widevine through a component updater; Spotify's
  // in-app player needs it. Plain Electron has no `components`, which is fine.
  try {
    const { components } = require('electron')
    if (components) await Promise.race([components.whenReady(), new Promise((r) => setTimeout(r, 8000))])
  } catch (err) {
    console.warn('Widevine unavailable:', err?.message ?? err)
  }

  // A monitor unplugged while spanning would leave the window hanging off
  // into nothing; fall back to one screen.
  screen.on('display-removed', () => {
    if (isSpanned() && screen.getAllDisplays().length < 2) {
      setSpanned(false)
      win?.webContents.send('span-changed', false)
    }
  })

  pendingPaths.push(...filesFromArgv(process.argv))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
