// Builds the offline English dictionary from WordNet: every word with its
// senses (part of speech, definition, an example or two, synonyms), plus
// WordNet's irregular forms ("geese" → goose, "ran" → run). Written gzipped
// to public/dict/en.json.gz and loaded by the app the first time you look
// a word up.
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const dict = join(dirname(require.resolve('wndb-with-exceptions/package.json')), 'dict')
const out = join(import.meta.dirname, '..', 'public', 'dict', 'en.json.gz')

if (existsSync(out) && statSync(out).mtimeMs > statSync(import.meta.filename).mtimeMs) process.exit(0)

const POS = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' }
const lines = (file) => readFileSync(join(dict, file), 'latin1').split('\n').filter((l) => l && !l.startsWith('  '))
const word = (w) => w.replace(/_/g, ' ').replace(/\(\w+\)$/, '')

// Synsets: offset → index into the list we write.
const synsets = []
const where = new Map()
for (const [file, pos] of Object.entries(POS)) {
  for (const line of lines(`data.${file}`)) {
    const [head, gloss = ''] = line.split(' | ')
    const parts = head.split(' ')
    const count = parseInt(parts[3], 16)
    const lemmas = []
    for (let i = 0; i < count; i++) lemmas.push(word(parts[4 + i * 2]))
    // The gloss is a definition followed by quoted examples.
    const examples = [...gloss.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).slice(0, 2)
    const definition = gloss.split(/;\s*"/)[0].replace(/;\s*$/, '').trim()
    where.set(`${pos}${parts[0]}`, synsets.length)
    synsets.push([pos, definition, examples, [...new Set(lemmas)].slice(0, 8)])
  }
}

// Words: lemma → its synsets, most common sense first (WordNet's own order).
const words = Object.create(null)
for (const [file, pos] of Object.entries(POS)) {
  for (const line of lines(`index.${file}`)) {
    const parts = line.trim().split(' ')
    const lemma = word(parts[0])
    const pointers = parseInt(parts[3], 10)
    const offsets = parts.slice(4 + pointers + 2)
    const list = (words[lemma] ??= [])
    for (const offset of offsets) {
      const at = where.get(`${pos}${offset}`)
      if (at !== undefined) list.push(at)
    }
  }
}

// Irregular forms.
const irregular = Object.create(null)
for (const file of ['noun', 'verb', 'adj', 'adv']) {
  for (const line of lines(`${file}.exc`)) {
    const [form, base] = line.trim().split(' ')
    if (form && base && !irregular[word(form)]) irregular[word(form)] = word(base)
  }
}

const json = JSON.stringify({ synsets, words, irregular })
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, gzipSync(json, { level: 9 }))
// WordNet's licence asks that its notice travel with every copy.
copyFileSync(join(dict, '..', 'LICENSE'), join(dirname(out), 'WORDNET-LICENSE.txt'))
console.log(`English dictionary: ${Object.keys(words).length} words, ${(statSync(out).size / 1e6).toFixed(1)} MB`)
