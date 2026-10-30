// Holds the dictionaries off the main thread: a few megabytes of JSON each,
// parsed once, the first time a word in that language is looked up.
import { deinflect, fits } from './deinflect'
import type { EnglishEntry, JapaneseEntry, JapaneseWord, Sense } from './dictionary'

interface Data {
  /** [part of speech, definition, examples, synonyms] */
  synsets: [string, string, string[], string[]][]
  words: Record<string, number[]>
  irregular: Record<string, string>
}

interface JaData {
  /** [kanji forms, kana forms, senses as [part-of-speech tags, glosses], common] */
  entries: [string[], string[], [string[], string[]][], number][]
  index: Record<string, number[]>
}

const loaded = new Map<string, Promise<unknown>>()

function load<T>(url: string, missing: string): Promise<T> {
  let p = loaded.get(url)
  if (!p) {
    p = fetch(url).then(async (res) => {
      if (!res.ok || !res.body) throw new Error(missing)
      return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json()
    })
    p.catch(() => loaded.delete(url))
    loaded.set(url, p)
  }
  return p as Promise<T>
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

function lookup(raw: string, d: Data): EnglishEntry | null {
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
    return { lang: 'en', word: forms[0], asked: word, senses }
  }
  return null
}

// Part-of-speech tags, in words.
const POS_LABEL: [RegExp, string][] = [
  [/^n$/, 'noun'], [/^n-(adv|t)$/, 'noun'], [/^pn$/, 'pronoun'], [/^v1/, 'ichidan verb'], [/^v5/, 'godan verb'], [/^vk$/, 'kuru verb'],
  [/^vs/, 'suru verb'], [/^vt$/, 'transitive'], [/^vi$/, 'intransitive'], [/^adj-i/, 'i-adjective'], [/^adj-na$/, 'na-adjective'],
  [/^adj-no$/, 'takes の'], [/^adj-pn$/, 'pre-noun'], [/^adv/, 'adverb'], [/^exp$/, 'expression'], [/^int$/, 'interjection'],
  [/^conj$/, 'conjunction'], [/^prt$/, 'particle'], [/^ctr$/, 'counter'], [/^suf$/, 'suffix'], [/^pref$/, 'prefix'], [/^aux/, 'auxiliary'],
]
const posLabels = (tags: string[]) => [...new Set(tags.flatMap((t) => POS_LABEL.find(([re]) => re.test(t))?.[1] ?? []))]

/** The longest word at the start of `text`, with its conjugation undone. */
function lookupJapanese(text: string, d: JaData): JapaneseEntry | null {
  const clean = text.trim().slice(0, 16)
  for (let len = clean.length; len > 0; len--) {
    const prefix = clean.slice(0, len)
    const words: (JapaneseWord & { common: number })[] = []
    const seen = new Set<number>()
    for (const c of deinflect(prefix)) {
      for (const at of d.index[c.word] ?? []) {
        if (seen.has(at)) continue
        const [kanji, kana, senses, common] = d.entries[at]
        if (!senses.some(([pos]) => fits(c.type, pos))) continue
        seen.add(at)
        words.push({ kanji, kana, senses: senses.map(([pos, glosses]) => ({ pos: posLabels(pos), glosses })), reasons: c.reasons, common })
      }
    }
    if (words.length) {
      // Exact matches and common words first.
      words.sort((a, b) => a.reasons.length - b.reasons.length || b.common - a.common)
      return { lang: 'ja', asked: text, matched: prefix, words: words.slice(0, 6).map((w) => ({ kanji: w.kanji, kana: w.kana, senses: w.senses, reasons: w.reasons })) }
    }
  }
  return null
}

self.onmessage = async (e: MessageEvent<{ id: number; url: string; word: string; lang: 'en' | 'ja' }>) => {
  const { id, url, word, lang } = e.data
  try {
    const entry =
      lang === 'ja'
        ? lookupJapanese(word, await load<JaData>(url, 'The Japanese dictionary isn’t included in this build.'))
        : lookup(word, await load<Data>(url, 'The dictionary is missing from this build.'))
    self.postMessage({ id, entry })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
