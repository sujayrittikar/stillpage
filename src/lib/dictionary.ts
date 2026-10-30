export interface Sense {
  pos: 'noun' | 'verb' | 'adjective' | 'adverb'
  definition: string
  examples: string[]
  synonyms: string[]
}

export interface EnglishEntry {
  lang: 'en'
  /** The dictionary form, e.g. "run" for "running". */
  word: string
  /** What was looked up. */
  asked: string
  senses: Sense[]
}

export interface JapaneseWord {
  kanji: string[]
  kana: string[]
  senses: { pos: string[]; glosses: string[] }[]
  /** How the text was conjugated, e.g. ["passive", "past"]. */
  reasons: string[]
}

export interface JapaneseEntry {
  lang: 'ja'
  /** What was looked up, and how much of it made the word. */
  asked: string
  matched: string
  words: JapaneseWord[]
}

export type Entry = EnglishEntry | JapaneseEntry

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u

/** Japanese text, which has no spaces between words. */
export const isJapanese = (text: string) => JAPANESE.test(text.trim()[0] ?? '')

let worker: Worker | null = null
let next = 0
const waiting = new Map<number, { resolve: (e: Entry | null) => void; reject: (err: Error) => void }>()

/** Looks a word up offline: English in WordNet, Japanese in JMdict (the
 *  longest word at the start of the text, conjugations undone). Null when
 *  nothing is found. */
export function define(word: string): Promise<Entry | null> {
  if (!worker) {
    worker = new Worker(new URL('./dictionary.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; entry?: Entry | null; error?: string }>) => {
      const job = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (e.data.error) job?.reject(new Error(e.data.error))
      else job?.resolve(e.data.entry ?? null)
    }
  }
  const id = next++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    const lang = isJapanese(word) ? 'ja' : 'en'
    worker!.postMessage({ id, word, lang, url: new URL(`./dict/${lang}.json.gz`, document.baseURI).href })
  })
}

/** Is this something worth looking up: one word, or a short phrase? */
export function lookupable(text: string): boolean {
  const t = text.trim()
  if (isJapanese(t)) return t.length <= 24 && !/\s/.test(t)
  return t.length > 0 && t.length < 48 && t.split(/\s+/).length <= 3 && /\p{L}/u.test(t)
}
