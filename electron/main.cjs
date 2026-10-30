// Stillpage — Electron main process.
// Serves the built renderer over a privileged app:// scheme, handles "Open with"
// from the file manager, and runs the Spotify login in a child window.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, screen, session, shell } = require('electron')
const fs = require('node:fs')
const { setFullscreenMonitors } = require('./x11.cjs')
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

// Spanning monitors uses an X11 window-manager hint (see x11.cjs). On Wayland
// sessions the desktop launcher starts Stillpage under XWayland with
// --ozone-platform=x11. Electron reads that flag before this file runs, and
// switching any later breaks the GPU process, so without it we stay on
// Wayland and simply don't offer spanning.
const CAN_SPAN =
  process.platform === 'linux' &&
  Boolean(process.env.DISPLAY) &&
  (process.env.XDG_SESSION_TYPE !== 'wayland' || app.commandLine.getSwitchValue('ozone-platform') === 'x11')

// Spotify streams every song (10-16 MB each) through the browser cache, which
// otherwise grows by hundreds of MB. Past this size Chromium drops the least
// recently used entries as it writes; the app itself is served from disk, so
// none of its own files depend on the cache.
const CACHE_LIMIT = 64 * 1024 * 1024
app.commandLine.appendSwitch('disk-cache-size', String(CACHE_LIMIT))

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
/** A folder asked for before the renderer was ready. */
let pendingFolder = null
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

/** A folder named on the command line (`stillpage ~/notes`) opens as the vault. */
function folderFromArgv(argv) {
  const dirs = argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-') && arg !== '.' && path.resolve(arg) !== app.getAppPath())
    .map((arg) => path.resolve(arg))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    })
  return dirs.at(-1) ?? null
}

function readFiles(paths) {
  return paths.map((p) => ({ name: path.basename(p), path: p, data: fs.readFileSync(p), lastModified: fs.statSync(p).mtimeMs }))
}

function openPaths(paths) {
  if (!paths.length) return
  if (win && rendererReady) win.webContents.send('open-files', readFiles(paths))
  else pendingPaths.push(...paths)
}

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json')
let spanned = false

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

/** Fullscreen over every monitor, or back to a normal window. Window managers
 *  keep ordinary windows on one monitor, so spanning is a special fullscreen.
 *  Returns where the monitor edges fall, as fractions of the window width,
 *  so panes can line up with the bezels. */
async function setSpanned(on) {
  if (!win) return { spanned: false, seams: [] }
  if (on && CAN_SPAN && screen.getAllDisplays().length > 1) {
    try {
      const id = win.getNativeWindowHandle().readUInt32LE(0)
      const monitors = await setFullscreenMonitors(id)
      spanned = true
      win.setFullScreen(true)
      writeState({ spanned: true })
      const left = Math.min(...monitors.map((m) => m.x))
      const width = Math.max(...monitors.map((m) => m.x + m.width)) - left
      const seams = [...new Set(monitors.map((m) => m.x + m.width))]
        .filter((edge) => edge < left + width)
        .sort((a, b) => a - b)
        .map((edge) => (edge - left) / width)
      return { spanned: true, seams }
    } catch (err) {
      console.warn('Could not span screens:', err?.message ?? err)
      spanned = false
      return { spanned: false, seams: [] }
    }
  }
  if (spanned) {
    spanned = false
    win.setFullScreen(false)
  }
  writeState({ spanned: false })
  return { spanned: false, seams: [] }
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
  // Right-click: the renderer draws the menu, in the app's own style, from
  // what Chromium knows about the spot (spelling suggestions included).
  win.webContents.on('context-menu', (_event, params) => {
    win?.webContents.send('context-menu', {
      x: params.x,
      y: params.y,
      selectionText: params.selectionText,
      misspelledWord: params.misspelledWord,
      suggestions: params.dictionarySuggestions,
      isEditable: params.isEditable,
      canCut: params.editFlags.canCut,
      canCopy: params.editFlags.canCopy,
      canPaste: params.editFlags.canPaste,
      canSelectAll: params.editFlags.canSelectAll,
    })
  })
  win.on('closed', () => {
    win = null
    spanned = false
    rendererReady = false
  })

  win.loadURL(DEV_URL || 'app://stillpage/index.html')
  if (readState().spanned) {
    win.once('ready-to-show', async () => win?.webContents.send('span-changed', (await setSpanned(true)).spanned))
  }
  // Leaving fullscreen any other way (Esc, F11, the window manager) ends spanning.
  win.on('leave-full-screen', () => {
    if (!spanned) return
    spanned = false
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

// ---------- Exports ----------

async function askWhereToSave(name, filters) {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), String(name).replace(/[\\/]/g, '-')),
    filters,
  })
  return result.canceled ? null : result.filePath
}

/** Literata from the built renderer, inlined so the PDF matches the app. */
function exportFonts() {
  try {
    const assets = path.join(DIST, 'assets')
    const files = fs.readdirSync(assets)
    const face = (prefix, style) => {
      const file = files.find((f) => f.startsWith(prefix) && f.endsWith('.woff2'))
      if (!file) return ''
      const data = fs.readFileSync(path.join(assets, file)).toString('base64')
      return `@font-face{font-family:Literata;font-style:${style};font-weight:200 900;src:url(data:font/woff2;base64,${data}) format('woff2')}`
    }
    return face('literata-latin-standard-normal', 'normal') + face('literata-latin-standard-italic', 'italic')
  } catch {
    return ''
  }
}

const EXPORT_CSS = `
@page { size: A4; margin: 22mm 20mm; }
body { font: 11.5pt/1.6 Literata, Georgia, serif; color: #23272b; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.4em 0 .5em; font-weight: 600; }
h1 { font-size: 21pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
p, ul, ol, blockquote, pre { margin: 0 0 .8em; }
li > p { margin: 0 0 .2em; }
blockquote { margin-left: 0; padding-left: 1em; border-left: 2px solid #9aa7b4; color: #4a525a; font-style: italic; }
code { font: 10pt 'IBM Plex Mono', monospace; background: #f1f2ef; padding: .1em .3em; border-radius: 3px; }
pre { background: #f4f5f2; padding: .8em 1em; border-radius: 6px; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
a { color: #3a5676; }
hr { border: 0; border-top: 1px solid #d5d8d2; margin: 1.6em 0; }
ul[data-type=taskList] { list-style: none; padding-left: .2em; }
ul[data-type=taskList] li { display: flex; gap: .5em; }
ul[data-type=taskList] li > label { flex: 0 0 auto; }
ul[data-type=taskList] li > div > p { margin: 0; }
img { max-width: 100%; }
`

async function exportPdf(name, html) {
  const target = await askWhereToSave(name, [{ name: 'PDF', extensions: ['pdf'] }])
  if (!target) return null
  const page = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
  try {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${exportFonts()}${EXPORT_CSS}</style></head><body>${html}</body></html>`
    await page.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(doc).toString('base64'))
    const pdf = await page.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    fs.writeFileSync(target, pdf)
    return target
  } finally {
    page.destroy()
  }
}

ipcMain.handle('export-pdf', (_event, name, html) => (typeof html === 'string' ? exportPdf(name, html) : null))
ipcMain.handle('save-file', async (_event, name, text) => {
  if (typeof text !== 'string') return null
  const ext = path.extname(String(name)).slice(1) || 'txt'
  const target = await askWhereToSave(name, [{ name: ext.toUpperCase(), extensions: [ext] }])
  if (!target) return null
  fs.writeFileSync(target, text)
  return target
})
ipcMain.handle('show-in-folder', (_event, file) => {
  if (typeof file === 'string' && path.isAbsolute(file)) shell.showItemInFolder(file)
})

// ---------- Editing files in place ----------
// Text files you open can be edited, and the edits go back to the file.
// Only existing, plain-text files are ever written, and only when they still
// look the way they did when Stillpage read them (or you say to overwrite).

const MAX_TEXT_BYTES = 32 * 1024 * 1024
const BINARY_EXT = /\.(pdf|docx?|pptx?|xlsx?|od[tpsg]|epub|png|jpe?g|gif|webp|avif|bmp|zip|gz|exe|so|bin)$/i

function textFile(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || BINARY_EXT.test(file)) return null
  try {
    const stat = fs.statSync(file)
    return stat.isFile() && stat.size <= MAX_TEXT_BYTES ? stat : null
  } catch {
    return null
  }
}

ipcMain.handle('read-text-file', (_event, file) => {
  const stat = textFile(file)
  if (!stat) return { error: 'missing' }
  return { text: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs }
})

ipcMain.handle('read-files', (_event, files) => {
  if (!Array.isArray(files)) return []
  const ok = files.filter((file) => {
    try {
      const stat = typeof file === 'string' && path.isAbsolute(file) ? fs.statSync(file) : null
      return Boolean(stat?.isFile() && stat.size <= MAX_FILE_BYTES)
    } catch {
      return false
    }
  })
  return readFiles(ok)
})

ipcMain.handle('stat-file', (_event, file) => {
  try {
    const stat = typeof file === 'string' && path.isAbsolute(file) ? fs.statSync(file) : null
    return stat?.isFile() ? { mtime: stat.mtimeMs, size: stat.size } : null
  } catch {
    return null
  }
})

ipcMain.handle('write-text-file', (_event, file, text, expectedMtime, force) => {
  const stat = textFile(file)
  if (!stat || typeof text !== 'string') return { error: 'This file is no longer where it was opened from.' }
  // Changed by something else since we read it: ask before overwriting.
  if (!force && typeof expectedMtime === 'number' && Math.abs(stat.mtimeMs - expectedMtime) > 1) return { conflict: true, mtime: stat.mtimeMs }
  try {
    // Write next to the file and swap it in, so a crash never leaves half a
    // file. Through a symlink, the file it points to is the one replaced.
    const real = fs.realpathSync(file)
    const temp = path.join(path.dirname(real), `.${path.basename(real)}.stillpage-${process.pid}`)
    fs.writeFileSync(temp, text, { mode: stat.mode })
    fs.renameSync(temp, real)
    return { mtime: fs.statSync(file).mtimeMs }
  } catch (err) {
    return { error: err?.code === 'EACCES' || err?.code === 'EROFS' ? 'This file is read-only.' : 'The file could not be saved.' }
  }
})

// Word and LibreOffice documents are rewritten from the page editor, which
// keeps their words and structure but not every detail of their layout. So
// before Stillpage first changes one, the original is copied to a backups
// folder, where it can always be found again.
const DOCUMENT_EXT = /\.(docx|odt)$/i
const BACKUPS = () => path.join(app.getPath('userData'), 'backups')
const backedUp = new Set()

function backUp(file) {
  if (backedUp.has(file)) return null
  const dir = BACKUPS()
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(file)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const copy = path.join(dir, `${path.basename(file, ext)} ${stamp}${ext}`)
  fs.copyFileSync(file, copy)
  backedUp.add(file)
  // Keep the newest 50.
  const all = fs.readdirSync(dir).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)
  for (const old of all.slice(50)) fs.rmSync(path.join(dir, old.f), { force: true })
  return copy
}

ipcMain.handle('write-document', (_event, file, data, expectedMtime, force) => {
  let stat
  try {
    stat = typeof file === 'string' && path.isAbsolute(file) && DOCUMENT_EXT.test(file) ? fs.statSync(file) : null
  } catch {
    stat = null
  }
  if (!stat?.isFile() || !(data instanceof Uint8Array)) return { error: 'This file is no longer where it was opened from.' }
  if (!force && typeof expectedMtime === 'number' && Math.abs(stat.mtimeMs - expectedMtime) > 1) return { conflict: true, mtime: stat.mtimeMs }
  try {
    const backup = backUp(file)
    const real = fs.realpathSync(file)
    const temp = path.join(path.dirname(real), `.${path.basename(real)}.stillpage-${process.pid}`)
    fs.writeFileSync(temp, Buffer.from(data), { mode: stat.mode })
    fs.renameSync(temp, real)
    return { mtime: fs.statSync(file).mtimeMs, backup }
  } catch (err) {
    return { error: err?.code === 'EACCES' || err?.code === 'EROFS' ? 'This file is read-only.' : 'The file could not be saved.' }
  }
})

ipcMain.handle('show-backups', () => {
  fs.mkdirSync(BACKUPS(), { recursive: true })
  return shell.openPath(BACKUPS())
})

// ---------- Folders (vaults) ----------
// Open a folder and everything readable in it is there to open, kept up to
// date as files come and go. Stillpage only reads the folder, except for
// what you do on purpose: new notes, renames, and moving files to the trash.

const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv', '.venv', 'target', 'dist', 'build'])
const MAX_VAULT_FILES = 20000
let vault = null
let vaultWatcher = null
let vaultTimer = null

const isHidden = (name) => name.startsWith('.')
const insideVault = (file) => vault && typeof file === 'string' && path.isAbsolute(file) && path.resolve(file).startsWith(vault + path.sep)

async function scanVault(root) {
  const files = []
  const walk = async (dir, depth) => {
    if (files.length >= MAX_VAULT_FILES || depth > 12) return
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (isHidden(entry.name) || files.length >= MAX_VAULT_FILES) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1)
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(full)
          files.push({ rel: path.relative(root, full), size: stat.size, mtime: stat.mtimeMs })
        } catch {}
      }
    }
  }
  await walk(root, 0)
  return { root, name: path.basename(root), files, truncated: files.length >= MAX_VAULT_FILES }
}

function watchVault(root) {
  vaultWatcher?.close()
  vaultWatcher = null
  vault = root
  if (!root) return
  try {
    vaultWatcher = fs.watch(root, { recursive: true }, (_type, name) => {
      // Our own save files, and anything hidden, aren't news.
      if (name && String(name).split(path.sep).some(isHidden)) return
      clearTimeout(vaultTimer)
      vaultTimer = setTimeout(() => win?.webContents.send('vault-changed', root), 250)
    })
    vaultWatcher.on('error', () => {})
  } catch {}
}

/** A name for a new file that doesn't clash with one already there. */
function freeName(dir, base, ext) {
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`
    if (!fs.existsSync(path.join(dir, name))) return path.join(dir, name)
  }
  return path.join(dir, `${base} ${Date.now()}${ext}`)
}

// Control characters too: they can't be typed, only pasted by accident.
// eslint-disable-next-line no-control-regex
const cleanName = (name) => String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().replace(/^\.+/, '').trim().slice(0, 120)

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Open a folder' })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('vault-open', async (_event, root) => {
  if (root === null) {
    watchVault(null)
    return null
  }
  try {
    if (typeof root !== 'string' || !path.isAbsolute(root) || !fs.statSync(root).isDirectory()) return null
  } catch {
    return null
  }
  const real = fs.realpathSync(root)
  watchVault(real)
  return scanVault(real)
})

ipcMain.handle('vault-scan', () => (vault ? scanVault(vault) : null))

ipcMain.handle('vault-create', (_event, dir, name, text) => {
  const folder = dir ? path.resolve(vault ?? '', dir) : vault
  if (!vault || (folder !== vault && !insideVault(folder))) return null
  const base = cleanName(name) || 'Untitled'
  const ext = /\.(md|markdown|txt)$/i.exec(base)?.[0] ?? '.md'
  const file = freeName(folder, base.endsWith(ext) ? base.slice(0, -ext.length) : base, ext)
  fs.writeFileSync(file, typeof text === 'string' ? text : '', { flag: 'wx' })
  return file
})

ipcMain.handle('vault-rename', (_event, file, name) => {
  if (!insideVault(file)) return null
  const clean = cleanName(name)
  if (!clean) return null
  const ext = path.extname(file)
  const target = path.join(path.dirname(file), clean.toLowerCase().endsWith(ext.toLowerCase()) ? clean : clean + ext)
  if (target === file) return file
  if (fs.existsSync(target)) return { error: 'There is already a file with that name.' }
  fs.renameSync(file, target)
  return target
})

ipcMain.handle('vault-trash', async (_event, file) => {
  if (!insideVault(file)) return false
  await shell.trashItem(file)
  return true
})

ipcMain.handle('vault-reveal', (_event, file) => {
  if (insideVault(file) || file === vault) shell.showItemInFolder(file)
})

// ---------- LibreOffice ----------
// Old Word/PowerPoint files, drawings, Pages, Keynote and friends have no
// browser-side reader; LibreOffice can draw any of them as PDF pages. We use
// whatever LibreOffice the person already has (distro package, snap, flatpak
// or the official /opt build) and never bundle it.

let officeBinary
function findOffice() {
  if (officeBinary !== undefined) return officeBinary
  const candidates = [
    process.env.STILLPAGE_SOFFICE,
    ...(process.env.PATH ?? '').split(':').flatMap((dir) => [path.join(dir, 'soffice'), path.join(dir, 'libreoffice')]),
    '/usr/lib/libreoffice/program/soffice',
    '/snap/bin/libreoffice',
    path.join(app.getPath('home'), '.local/share/flatpak/exports/bin/org.libreoffice.LibreOffice'),
    '/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice',
  ]
  try {
    for (const dir of fs.readdirSync('/opt')) if (/^libreoffice/i.test(dir)) candidates.push(path.join('/opt', dir, 'program', 'soffice'))
  } catch {}
  officeBinary = candidates.find((file) => {
    try {
      return file && fs.statSync(file).isFile() && (fs.accessSync(file, fs.constants.X_OK), true)
    } catch {
      return false
    }
  }) ?? null
  return officeBinary
}

// One conversion at a time: they share a LibreOffice profile.
let officeQueue = Promise.resolve()

function convertToPdf(name, data) {
  const run = async () => {
    const soffice = findOffice()
    if (!soffice) throw new Error('no-office')
    // Inside the user's data folder rather than /tmp, which a flatpak
    // LibreOffice cannot see.
    const work = fs.mkdtempSync(path.join(app.getPath('userData'), 'convert-'))
    const profile = pathToFileURL(path.join(app.getPath('userData'), 'libreoffice-profile')).href
    try {
      const input = path.join(work, path.basename(String(name)).replace(/[^\w.\- ]/g, '_') || 'document')
      fs.writeFileSync(input, Buffer.from(data))
      await new Promise((resolve, reject) => {
        require('node:child_process').execFile(
          soffice,
          // Its own profile, so it works even while LibreOffice is open.
          [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nolockcheck', '--convert-to', 'pdf', '--outdir', work, input],
          { timeout: 180000 },
          (err) => (err ? reject(err) : resolve()),
        )
      })
      const pdf = fs.readdirSync(work).find((f) => f.toLowerCase().endsWith('.pdf'))
      if (!pdf) throw new Error('LibreOffice could not convert this file.')
      return fs.readFileSync(path.join(work, pdf))
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  }
  const job = officeQueue.then(run, run)
  officeQueue = job.catch(() => {})
  return job
}

/** The one command that installs LibreOffice on this distro. */
function officeInstallCommand() {
  let ids = ''
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf8')
    ids = [/^ID=(.*)$/m, /^ID_LIKE=(.*)$/m].map((re) => re.exec(release)?.[1] ?? '').join(' ').replace(/"/g, '')
  } catch {}
  if (/\b(debian|ubuntu)\b/.test(ids)) return 'sudo apt install libreoffice-writer libreoffice-impress libreoffice-draw'
  if (/\barch\b/.test(ids)) return 'sudo pacman -S libreoffice-fresh'
  if (/\b(fedora|rhel)\b/.test(ids)) return 'sudo dnf install libreoffice-writer libreoffice-impress libreoffice-draw'
  if (/\b(suse|opensuse)\b/.test(ids)) return 'sudo zypper install libreoffice'
  return 'flatpak install flathub org.libreoffice.LibreOffice'
}

ipcMain.handle('office-status', () => {
  officeBinary = undefined // look again: it may have just been installed
  return { ready: Boolean(findOffice()), install: officeInstallCommand() }
})
ipcMain.handle('convert-to-pdf', async (_event, name, data) => {
  if (!(data instanceof Uint8Array) || data.byteLength > MAX_FILE_BYTES) return { error: 'This file is too large to convert.' }
  try {
    return { pdf: await convertToPdf(name, data) }
  } catch (err) {
    return { error: err?.message === 'no-office' ? 'no-office' : 'LibreOffice could not open this file. It may be damaged or password-protected.' }
  }
})

ipcMain.handle('take-pending-folder', () => {
  const folder = pendingFolder
  pendingFolder = null
  return folder
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
ipcMain.handle('edit-action', (_event, action, word) => {
  const contents = win?.webContents
  if (!contents) return
  if (action === 'replace' && typeof word === 'string') contents.replaceMisspelling(word)
  else if (action === 'learn' && typeof word === 'string') contents.session.addWordToSpellCheckerDictionary(word)
  else if (action === 'cut' || action === 'copy' || action === 'paste' || action === 'selectAll') contents[action]()
})
ipcMain.handle('span-screens', (_event, on) => setSpanned(on === undefined ? !spanned : Boolean(on)))
ipcMain.handle('screen-info', () => ({ count: CAN_SPAN ? screen.getAllDisplays().length : 1, spanned }))
ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url)
})

app.on('second-instance', (_event, argv) => {
  openPaths(filesFromArgv(argv))
  const folder = folderFromArgv(argv)
  if (folder) win?.webContents.send('open-folder', folder)
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
    if (spanned && screen.getAllDisplays().length < 2) {
      void setSpanned(false).then(() => win?.webContents.send('span-changed', false))
    }
  })

  pendingPaths.push(...filesFromArgv(process.argv))
  pendingFolder = folderFromArgv(process.argv)
  createWindow()

  // Versions before the limit could leave a much larger cache behind; clear
  // it once in the background rather than wait for eviction to catch up.
  session.defaultSession
    .getCacheSize()
    .then((size) => size > CACHE_LIMIT && session.defaultSession.clearCache())
    .catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
