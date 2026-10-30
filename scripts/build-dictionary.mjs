// Builds the offline dictionaries into public/dict, each loaded by the app
// the first time it's needed:
//
// en.json.gz           WordNet: every word's senses (part of speech,
//                      definition, examples, synonyms) and irregular forms
//                      ("geese" → goose, "ran" → run).
// ja.json.gz           JMdict's common words (about 22,000), downloaded once
//                      from the jmdict-simplified release and checked.
// autocorrect.json.gz  Common English misspellings with one clear fix
//                      ("teh" → the), minus anything that's a real word.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const dict = join(dirname(require.resolve('wndb-with-exceptions/package.json')), 'dict')
const dir = join(import.meta.dirname, '..', 'public', 'dict')
const out = join(dir, 'en.json.gz')
const fresh = (file) => existsSync(file) && statSync(file).mtimeMs > statSync(import.meta.filename).mtimeMs

if (fresh(out) && fresh(join(dir, 'ja.json.gz')) && fresh(join(dir, 'autocorrect.json.gz'))) process.exit(0)

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

// ---- Downloads -----------------------------------------------------------------
// Data that isn't an npm dependency is fetched once from a pinned address,
// kept in node_modules/.cache, and checked against its known checksum.

const cacheDir = join(import.meta.dirname, '..', 'node_modules', '.cache', 'stillpage')

async function download({ url, sha256, file }) {
  const cached = join(cacheDir, file)
  if (!existsSync(cached)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
  }
  const data = readFileSync(cached)
  if (createHash('sha256').update(data).digest('hex') !== sha256) throw new Error(`${file} did not match its checksum`)
  return data
}

/** The files in a .tgz, by path. Plain ustar, as npm packs them. */
function untar(tgz) {
  const tar = gunzipSync(tgz)
  const files = new Map()
  for (let at = 0; at + 512 <= tar.length; ) {
    const name = tar.toString('utf8', at, at + 100).replace(/\0.*$/s, '')
    if (!name) break
    const size = parseInt(tar.toString('utf8', at + 124, at + 136).replace(/\0.*$/s, '').trim() || '0', 8)
    files.set(name, tar.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

// ---- Autocorrect --------------------------------------------------------------

const MISSPELLINGS = {
  url: 'https://registry.npmjs.org/@cspell/dict-en-common-misspellings/-/dict-en-common-misspellings-2.2.5.tgz',
  sha256: '52eb06375093188819e9927e52428f0fb6e54bedfa32d6937c6627a41df0147f',
  file: 'dict-en-common-misspellings-2.2.5.tgz',
}

const known = new Set([...Object.keys(words), ...Object.keys(irregular)].map((w) => w.toLowerCase()))
// A real word in some form: "loosing" is loose + ing, so it is left alone.
// But "occured" is occur + ed missing a doubled r, and the fix says so.
const ENDINGS = [['s', ''], ['es', ''], ['ies', 'y'], ['ed', ''], ['ed', 'e'], ['ied', 'y'], ['ing', ''], ['ing', 'e'], ['er', ''], ['er', 'e'], ['est', ''], ['est', 'e'], ['ly', ''], ['ily', 'y']]
function isWord(w, fix) {
  if (known.has(w)) return true
  return ENDINGS.some(([end, base]) => {
    if (!w.endsWith(end) || w.length <= end.length + 1) return false
    const stem = w.slice(0, -end.length)
    const doubled = stem + stem.at(-1) + end
    return known.has(stem + base) && fix !== doubled
  })
}
try {
  const typos = untar(await download(MISSPELLINGS))
  const misspellings = JSON.parse(typos.get('package/dict/dict-en.json').toString('utf8'))
  const fixes = Object.create(null)
  for (const line of misspellings.dictionaryDefinitions[0].suggestWords) {
    const [typo, fix] = line.split('->').map((x) => x.trim())
    // Only typos with one clear fix, and never a word that is itself real.
    if (!typo || !fix || fix.includes(',') || !/^[a-z]+$/.test(typo) || typo.length < 3 || isWord(typo, fix)) continue
    fixes[typo] = fix
  }
  // Missing apostrophes, the commonest slip of all.
  const contractions = {
    dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
    havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", couldnt: "couldn't", wouldnt: "wouldn't", shouldnt: "shouldn't",
    mustnt: "mustn't", neednt: "needn't", cant: "can't", wont: "won't", im: "I'm", ive: "I've", youre: "you're",
    youve: "you've", theyre: "they're", theyve: "they've", weve: "we've", thats: "that's", whats: "what's",
    theres: "there's", heres: "here's", wheres: "where's", whos: "who's", itll: "it'll", youll: "you'll",
    theyll: "they'll", shes: "she's", hes: "he's", i: 'I',
  }
  Object.assign(fixes, contractions)
  writeFileSync(join(dir, 'autocorrect.json.gz'), gzipSync(JSON.stringify(fixes), { level: 9 }))
  writeFileSync(join(dir, 'MISSPELLINGS-LICENSE.txt'), typos.get('package/LICENSE'))
  console.log(`Autocorrect: ${Object.keys(fixes).length} fixes`)
} catch (err) {
  // Without network on a first build the app still works, just without autocorrect.
  console.warn(`Autocorrect skipped: ${err.message}`)
}

// ---- Japanese -------------------------------------------------------------------

const JMDICT = {
  url: 'https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261026175559/jmdict-eng-common-3.6.2%2B20261026175559.json.zip',
  sha256: 'a6b049ec605fa1135f02fa772edee6a71cffcbe6f7e321143667946f93b32dde',
  file: 'jmdict-eng-common-3.6.2.zip',
}

async function jmdict() {
  const archive = await JSZip.loadAsync(await download(JMDICT))
  const file = Object.values(archive.files).find((f) => f.name.endsWith('.json'))
  return JSON.parse(await file.async('string'))
}

try {
  const jm = await jmdict()
  const entries = []
  const index = Object.create(null)
  for (const w of jm.words) {
    const kanji = w.kanji.filter((k) => !k.tags.some((t) => t === 'sK' || t === 'iK')).map((k) => k.text)
    const kana = w.kana.filter((k) => !k.tags.includes('sk')).map((k) => k.text)
    const senses = w.sense.map((s) => [s.partOfSpeech, s.gloss.map((g) => g.text).slice(0, 6)])
    const common = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common)
    const at = entries.length
    entries.push([kanji, kana, senses, common ? 1 : 0])
    for (const form of [...w.kanji.map((k) => k.text), ...w.kana.map((k) => k.text)]) (index[form] ??= []).push(at)
  }
  writeFileSync(join(dir, 'ja.json.gz'), gzipSync(JSON.stringify({ entries, index }), { level: 9 }))
  writeFileSync(
    join(dir, 'JMDICT-LICENSE.txt'),
    `The Japanese dictionary is JMdict (common entries, ${jm.dictDate}), the property of the Electronic Dictionary
Research and Development Group, used under the Creative Commons Attribution-ShareAlike 4.0 licence:
https://www.edrdg.org/edrdg/licence.html  https://creativecommons.org/licenses/by-sa/4.0/
Converted to JSON by jmdict-simplified (https://github.com/scriptin/jmdict-simplified).
`,
  )
  console.log(`Japanese dictionary: ${entries.length} entries, ${(statSync(join(dir, 'ja.json.gz')).size / 1e6).toFixed(1)} MB`)
} catch (err) {
  // A build without network still works; the app says Japanese isn't included.
  console.warn(`Japanese dictionary skipped: ${err.message}`)
}
