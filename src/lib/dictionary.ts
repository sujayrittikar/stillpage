export interface Sense {
  pos: 'noun' | 'verb' | 'adjective' | 'adverb'
  definition: string
  examples: string[]
  synonyms: string[]
}

export interface Entry {
  /** The dictionary form, e.g. "run" for "running". */
  word: string
  /** What was looked up. */
  asked: string
  senses: Sense[]
}

let worker: Worker | null = null
let next = 0
const waiting = new Map<number, { resolve: (e: Entry | null) => void; reject: (err: Error) => void }>()

/** Looks a word up in the offline English dictionary (WordNet). Null when
 *  it isn't there. */
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
    worker!.postMessage({ id, word, url: new URL('./dict/en.json.gz', document.baseURI).href })
  })
}

/** Is this something worth looking up: one word, or a short phrase? */
export function lookupable(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length < 48 && t.split(/\s+/).length <= 3 && /\p{L}/u.test(t)
}
