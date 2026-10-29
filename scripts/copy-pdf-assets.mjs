// Copies pdf.js font, cmap and wasm data next to the app so PDFs with
// non-embedded fonts or JPEG 2000 images render correctly, fully offline.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('pdfjs-dist/package.json'))
const out = join(import.meta.dirname, '..', 'public', 'pdfjs')
mkdirSync(out, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) cpSync(join(root, dir), join(out, dir), { recursive: true })
