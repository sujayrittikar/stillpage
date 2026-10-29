// Just enough of the X11 protocol to ask the window manager for fullscreen
// across several monitors (_NET_WM_FULLSCREEN_MONITORS). GNOME keeps ordinary
// windows on one monitor whatever size they ask for; this hint is the
// supported way past that. No native modules: we talk to the X socket directly.
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')

const pad = (n) => (4 - (n % 4)) % 4

function parseDisplay(display = process.env.DISPLAY) {
  const m = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(display ?? '')
  return m ? m[1] : null
}

/** Finds the MIT-MAGIC-COOKIE-1 for this display in the Xauthority file. */
function readCookie(displayNumber) {
  const file = process.env.XAUTHORITY || `${os.homedir()}/.Xauthority`
  let buf
  try {
    buf = fs.readFileSync(file)
  } catch {
    return null
  }
  let at = 0
  const field = () => {
    const len = buf.readUInt16BE(at + 0)
    const value = buf.subarray(at + 2, at + 2 + len)
    at += 2 + len
    return value
  }
  while (at + 2 <= buf.length) {
    at += 2 // family
    field() // address
    const number = field().toString()
    const name = field().toString()
    const data = field()
    if (name === 'MIT-MAGIC-COOKIE-1' && (number === displayNumber || number === '')) return data
  }
  return null
}

/** A tiny request/reply client. Replies are matched in order; we never have
 *  more than one request in flight. */
function connect() {
  const displayNumber = parseDisplay()
  if (displayNumber === null) return Promise.reject(new Error('No X display'))
  const cookie = readCookie(displayNumber)
  const name = cookie ? Buffer.from('MIT-MAGIC-COOKIE-1') : Buffer.alloc(0)
  const data = cookie ?? Buffer.alloc(0)

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(`/tmp/.X11-unix/X${displayNumber}`)
    let pending = Buffer.alloc(0)
    let waiter = null
    let setupDone = false
    let root = 0

    const fail = (err) => {
      socket.destroy()
      reject(err)
    }
    socket.on('error', fail)
    socket.setTimeout(3000, () => fail(new Error('X server timed out')))

    socket.on('connect', () => {
      const head = Buffer.alloc(12)
      head.write('l', 0)
      head.writeUInt16LE(11, 2)
      head.writeUInt16LE(0, 4)
      head.writeUInt16LE(name.length, 6)
      head.writeUInt16LE(data.length, 8)
      socket.write(Buffer.concat([head, name, Buffer.alloc(pad(name.length)), data, Buffer.alloc(pad(data.length))]))
    })

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk])
      if (!setupDone) {
        if (pending.length < 8) return
        const total = 8 + pending.readUInt16LE(6) * 4
        if (pending.length < total) return
        if (pending[0] !== 1) return fail(new Error('X server refused the connection'))
        const vendorLength = pending.readUInt16LE(24)
        const formats = pending[29]
        root = pending.readUInt32LE(40 + vendorLength + pad(vendorLength) + 8 * formats)
        pending = pending.subarray(total)
        setupDone = true
        resolve({ root, request, close: () => socket.end() })
        return
      }
      drain()
    })

    function drain() {
      while (waiter && pending.length >= 32) {
        const kind = pending[0]
        if (kind === 0) {
          // Error
          const w = waiter
          const code = pending[1]
          waiter = null
          pending = pending.subarray(32)
          w.reject(new Error(`X error ${code}`))
        } else if (kind === 1) {
          const total = 32 + pending.readUInt32LE(4) * 4
          if (pending.length < total) return
          const w = waiter
          waiter = null
          const reply = pending.subarray(0, total)
          pending = pending.subarray(total)
          w.resolve(reply)
        } else {
          pending = pending.subarray(32) // an event; not ours to handle
        }
      }
    }

    function request(buf) {
      return new Promise((res, rej) => {
        waiter = { resolve: res, reject: rej }
        socket.write(buf)
        drain()
      })
    }
  })
}

async function internAtom(x, name) {
  const bytes = Buffer.from(name)
  const req = Buffer.alloc(8 + bytes.length + pad(bytes.length))
  req[0] = 16
  req[1] = 0
  req.writeUInt16LE(req.length / 4, 2)
  req.writeUInt16LE(bytes.length, 4)
  bytes.copy(req, 8)
  return (await x.request(req)).readUInt32LE(8)
}

/** Monitor rectangles in the window manager's own index order (Xinerama). */
async function monitors(x) {
  const ext = Buffer.from('XINERAMA')
  const query = Buffer.alloc(8 + ext.length)
  query[0] = 98
  query.writeUInt16LE(query.length / 4, 2)
  query.writeUInt16LE(ext.length, 4)
  ext.copy(query, 8)
  const found = await x.request(query)
  if (!found[8]) return []
  const opcode = found[9]
  const req = Buffer.alloc(4)
  req[0] = opcode
  req[1] = 5 // XineramaQueryScreens
  req.writeUInt16LE(1, 2)
  const reply = await x.request(req)
  const count = reply.readUInt32LE(8)
  return Array.from({ length: count }, (_, i) => {
    const at = 32 + i * 8
    return { x: reply.readInt16LE(at), y: reply.readInt16LE(at + 2), width: reply.readUInt16LE(at + 4), height: reply.readUInt16LE(at + 6) }
  })
}

/** Asks the window manager to make `windowId`'s fullscreen cover every monitor.
 *  Returns the monitor rectangles so the caller can find the seams. */
async function setFullscreenMonitors(windowId) {
  const x = await connect()
  try {
    const screens = await monitors(x)
    if (screens.length < 2) return screens
    const pick = (score) => screens.reduce((best, s, i) => (score(s) < score(screens[best]) ? i : best), 0)
    const top = pick((s) => s.y)
    const bottom = pick((s) => -(s.y + s.height))
    const left = pick((s) => s.x)
    const right = pick((s) => -(s.x + s.width))

    const type = await internAtom(x, '_NET_WM_FULLSCREEN_MONITORS')
    const event = Buffer.alloc(32)
    event[0] = 33 // ClientMessage
    event[1] = 32 // format
    event.writeUInt32LE(windowId, 4)
    event.writeUInt32LE(type, 8)
    ;[top, bottom, left, right, 1].forEach((v, i) => event.writeUInt32LE(v, 12 + i * 4))
    const send = Buffer.alloc(12)
    send[0] = 25 // SendEvent
    send.writeUInt16LE(11, 2)
    send.writeUInt32LE(x.root, 4)
    send.writeUInt32LE((1 << 19) | (1 << 20), 8) // SubstructureNotify | SubstructureRedirect
    // SendEvent has no reply; follow it with GetInputFocus so we know it landed.
    const sync = Buffer.alloc(4)
    sync[0] = 43
    sync.writeUInt16LE(1, 2)
    await x.request(Buffer.concat([send, event, sync]))
    return screens
  } finally {
    x.close()
  }
}

module.exports = { setFullscreenMonitors }
