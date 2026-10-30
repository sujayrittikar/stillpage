// Undoes Japanese conjugation so a dictionary form can be found: 食べさせられた
// → 食べる, 書かなかった → 書く, 高くて → 高い. Each rule swaps an ending for
// another and says what kind of word the result must be; a candidate counts
// only if the dictionary has it as that kind of word.

/** The word classes rules lead to, matched against JMdict's part-of-speech tags. */
export type WordClass = 'v1' | 'v5' | 'vk' | 'vs' | 'adj-i' | 'any'

interface Rule {
  from: string
  to: string
  type: WordClass
  /** Shown to the reader, e.g. "past", "negative". */
  name: string
}

// Godan verbs: the ending's vowel row changes with the form.
const GODAN: [string, string, string, string, string][] = [
  // dictionary, i-stem, a-stem, e-stem, o-stem
  ['う', 'い', 'わ', 'え', 'お'],
  ['く', 'き', 'か', 'け', 'こ'],
  ['ぐ', 'ぎ', 'が', 'げ', 'ご'],
  ['す', 'し', 'さ', 'せ', 'そ'],
  ['つ', 'ち', 'た', 'て', 'と'],
  ['ぬ', 'に', 'な', 'ね', 'の'],
  ['ぶ', 'び', 'ば', 'べ', 'ぼ'],
  ['む', 'み', 'ま', 'め', 'も'],
  ['る', 'り', 'ら', 'れ', 'ろ'],
]

// Past and te-forms of godan verbs, by dictionary ending.
const GODAN_TA: [string, string][] = [
  ['う', 'った'], ['つ', 'った'], ['る', 'った'], ['く', 'いた'], ['ぐ', 'いだ'], ['す', 'した'], ['ぬ', 'んだ'], ['ぶ', 'んだ'], ['む', 'んだ'],
]

const rules: Rule[] = []
const add = (from: string, to: string, type: WordClass, name: string) => rules.push({ from, to, type, name })

// Endings that attach to the masu-stem (i-stem for godan, bare stem for ichidan).
const STEM_ENDINGS: [string, string][] = [
  ['ます', 'polite'], ['ました', 'polite past'], ['ません', 'polite negative'], ['ませんでした', 'polite past negative'],
  ['ましょう', 'polite volitional'], ['まして', 'polite te-form'], ['たい', 'want to'], ['たかった', 'wanted to'],
  ['たくない', "don't want to"], ['なさい', 'command'], ['ながら', 'while'], ['そう', 'looks like'],
]
for (const [end, name] of STEM_ENDINGS) {
  add(end, 'る', 'v1', name)
  for (const [dict, i] of GODAN) add(i + end, dict, 'v5', name)
  add('し' + end, 'する', 'vs', name)
  add('き' + end, 'くる', 'vk', name)
}

// Past and te-forms.
for (const [suffix, name] of [['た', 'past'], ['て', 'te-form'], ['たら', 'if/when'], ['たり', 'and so on']] as const) {
  add(suffix, 'る', 'v1', name)
  for (const [dict, ta] of GODAN_TA) add(ta.slice(0, -1) + (ta.endsWith('だ') ? suffix.replace('た', 'だ').replace('て', 'で') : suffix), dict, 'v5', name)
  add('し' + suffix, 'する', 'vs', name)
  add('き' + suffix, 'くる', 'vk', name)
}
add('いって', 'いく', 'v5', 'te-form')
add('いった', 'いく', 'v5', 'past')
add('行って', '行く', 'v5', 'te-form')
add('行った', '行く', 'v5', 'past')

// Negative (a-stem + ない), which then conjugates like an adjective.
add('ない', 'る', 'v1', 'negative')
for (const [dict, , a] of GODAN) add(a + 'ない', dict, 'v5', 'negative')
add('しない', 'する', 'vs', 'negative')
add('こない', 'くる', 'vk', 'negative')
add('ず', 'る', 'v1', 'negative')
for (const [dict, , a] of GODAN) add(a + 'ず', dict, 'v5', 'negative')

// Potential, passive and causative: each makes an ichidan verb of its own.
for (const [dict, , a, e] of GODAN) {
  add(e + 'る', dict, 'v5', 'can')
  add(a + 'れる', dict, 'v5', 'passive')
  add(a + 'せる', dict, 'v5', 'causative')
  add(a + 'せられる', dict, 'v5', 'causative passive')
}
add('られる', 'る', 'v1', 'passive or can')
add('れる', 'る', 'v1', 'can')
add('させる', 'る', 'v1', 'causative')
add('させられる', 'る', 'v1', 'causative passive')
add('される', 'する', 'vs', 'passive')
add('させる', 'する', 'vs', 'causative')
add('できる', 'する', 'vs', 'can')
add('こられる', 'くる', 'vk', 'can')

// Volitional, conditional, imperative.
add('よう', 'る', 'v1', 'let’s')
for (const [dict, , , e, o] of GODAN) {
  add(o + 'う', dict, 'v5', 'let’s')
  add(e + 'ば', dict, 'v5', 'if')
  add(e, dict, 'v5', 'command')
}
add('れば', 'る', 'v1', 'if')
add('ろ', 'る', 'v1', 'command')
add('しよう', 'する', 'vs', 'let’s')
add('すれば', 'する', 'vs', 'if')
add('しろ', 'する', 'vs', 'command')
add('こよう', 'くる', 'vk', 'let’s')
add('くれば', 'くる', 'vk', 'if')
add('こい', 'くる', 'vk', 'command')

// Ongoing actions: 食べている → 食べて → 食べる.
for (const [end, to] of [['ている', 'て'], ['てる', 'て'], ['でいる', 'で'], ['でる', 'で'], ['ておく', 'て'], ['とく', 'て'], ['てしまう', 'て'], ['ちゃう', 'て'], ['じゃう', 'で']] as const) {
  add(end, to, 'any', end.includes('しま') || end.includes('ゃう') ? 'completely' : 'ongoing')
}

// い-adjectives.
for (const [end, name] of [['かった', 'past'], ['くない', 'negative'], ['くなかった', 'past negative'], ['くて', 'te-form'], ['く', 'adverb'], ['ければ', 'if'], ['さ', 'noun'], ['そう', 'looks'], ['すぎる', 'too']] as const) {
  add(end, 'い', 'adj-i', name)
}
// Endings that end in an adjective's い (ない, たい) go round again as adjectives.
add('なかった', 'ない', 'any', 'past')
add('なくて', 'ない', 'any', 'te-form')
add('なければ', 'ない', 'any', 'if')

// 来る is written in kanji as often as not: 来ない, 来ました, 来た.
for (const r of [...rules]) {
  if (r.type === 'vk' && /^[こきく]/.test(r.from)) add('来' + r.from.slice(1), '来る', 'vk', r.name)
}

rules.sort((a, b) => b.from.length - a.from.length)

export interface Candidate {
  word: string
  type: WordClass
  /** The forms undone, outermost last: ["causative", "passive", "past"]. */
  reasons: string[]
}

/** Every dictionary form `text` could be a conjugation of, itself included.
 *  A suru verb also gives its noun: 勉強する → 勉強, which the dictionary
 *  lists as a noun that takes する. */
export function deinflect(text: string): Candidate[] {
  const all = forms(text)
  for (const c of [...all]) {
    if (c.type === 'vs' && c.word.endsWith('する') && c.word.length > 2) all.push({ ...c, word: c.word.slice(0, -2) })
  }
  return all
}

function forms(text: string): Candidate[] {
  const out: Candidate[] = [{ word: text, type: 'any', reasons: [] }]
  const seen = new Set([text + ':any'])
  for (let i = 0; i < out.length && i < 200; i++) {
    const current = out[i]
    if (current.reasons.length >= 4) continue
    for (const rule of rules) {
      if (!current.word.endsWith(rule.from)) continue
      const word = current.word.slice(0, -rule.from.length) + rule.to
      if (!word) continue
      const key = `${word}:${rule.type}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ word, type: rule.type, reasons: [rule.name, ...current.reasons] })
    }
  }
  return out
}

/** Does a JMdict sense's part of speech fit the class a rule led to? */
export function fits(type: WordClass, pos: string[]): boolean {
  switch (type) {
    case 'any':
      return true
    case 'v1':
      return pos.some((p) => p.startsWith('v1'))
    case 'v5':
      return pos.some((p) => p.startsWith('v5'))
    case 'vk':
      return pos.includes('vk')
    case 'vs':
      return pos.some((p) => p.startsWith('vs'))
    case 'adj-i':
      return pos.some((p) => p === 'adj-i' || p === 'adj-ix')
  }
}
