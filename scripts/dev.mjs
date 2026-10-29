// Starts Vite and Electron together for development.
import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } })
await server.listen()
const url = 'http://127.0.0.1:5173/'
console.log(`\n  Renderer on ${url}\n`)

// Ubuntu 24.04+ blocks Chromium's user-namespace sandbox for unpackaged
// binaries; the installed .deb sets the sandbox up properly.
const electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.', '--no-sandbox', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, STILLPAGE_DEV_URL: url } },
)
electron.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
