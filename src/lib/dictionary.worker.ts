// Holds the English dictionary off the main thread: it's a few megabytes of
// JSON, parsed once, the first time a word is looked up.
import type { Entry, Sense } from './dictionary'

interface Data {
  /** [part of speech, definition, examples, synonyms] */
  synsets: [string, string, string[], string[]][]
  words: Record<string, number[]>
  irregular: Record<string, string>
}

let data: Promise<Data> | null = null

function load(url: string): Promise<Data> {
  data ??= fetch(url).then(async (res) => {
    if (!res.ok || !res.body) throw new Error('The dictionary is missing from this build.')
    return (await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json()) as Data
  })
  return data
}

// WordNet's "morphy": strip regular endings until a dictionary word appears.
const ENDINGS: [string, string][] = [
  ['ies', 'y'], ['ves', 'f'], ['ves', 'fe'], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['es', 'e'], ['es', ''], ['s', ''],
  ['ied', 'y'], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', ''],
  ['ier', 'y'], ['iest', 'y'], ['er', 'e'], ['er', ''], ['est', 'e'], ['est', ''],
  ['ly', ''], ['ily', 'y'],
]

function baseForms(word: string, d: Data): string[] {
  const forms = new Set<string>()
  const add = (w: string) => d.words[w] && forms.add(w)
  add(word)
  if (d.irregular[word]) add(d.irregular[word])
  for (const [end, base] of ENDINGS) {
    if (!word.endsWith(end) || word.length <= end.length + 1) continue
    const stem = word.slice(0, -end.length) + base
    add(stem)
    // running → run, stopped → stop
    if (!base && /([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1))
  }
  return [...forms]
}

const POS_NAME: Record<string, Sense['pos']> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' }

function lookup(raw: string, d: Data): Entry | null {
  const word = raw
    .trim()
    .replace(/[’']s$/i, '')
    .replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')
    .replace(/\s+/g, ' ')
  if (!word) return null
  const candidates = [...new Set([word.toLowerCase(), word, word.toLowerCase().replace(/-/g, ' ')])]
  for (const c of candidates) {
    const forms = baseForms(c, d)
    if (!forms.length) continue
    const seen = new Set<number>()
    const senses: Sense[] = []
    for (const form of forms) {
      for (const at of d.words[form]) {
        if (seen.has(at)) continue
        seen.add(at)
        const [pos, definition, examples, lemmas] = d.synsets[at]
        senses.push({ pos: POS_NAME[pos] ?? 'noun', definition, examples, synonyms: lemmas.filter((l) => l.toLowerCase() !== form) })
      }
    }
    return { word: forms[0], asked: word, senses }
  }
  return null
}

self.onmessage = async (e: MessageEvent<{ id: number; url: string; word: string }>) => {
  const { id, url, word } = e.data
  try {
    self.postMessage({ id, entry: lookup(word, await load(url)) })
  } catch (err) {
    data = null
    self.postMessage({ id, error: (err as Error).message })
  }
}
