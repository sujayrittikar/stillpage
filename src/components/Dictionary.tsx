import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { define, isJapanese, lookupable, type EnglishEntry, type Entry, type JapaneseEntry, type Sense } from '../lib/dictionary'
import { startAutocorrect } from '../lib/autocorrect'
import type { MenuParams } from '../lib/types'
import { wordAtPoint, wordAtSelection, type WordAt } from '../lib/words'
import '../styles/dictionary.css'

/** Puts `text` where the word was, as if typed, so undo works. */
function replaceWord(at: WordAt, text: string) {
  if (!at.range) return
  const sel = window.getSelection()
  const el = at.range.startContainer.parentElement?.closest<HTMLElement>('[contenteditable="true"]')
  el?.focus()
  sel?.removeAllRanges()
  sel?.addRange(at.range)
  // Keep the word's capital: "Big" becomes "Large", not "large".
  const original = at.range.toString()
  const fitted = /^\p{Lu}/u.test(original) && /^\p{Ll}/u.test(text) ? text[0].toUpperCase() + text.slice(1) : text
  document.execCommand('insertText', false, fitted)
}

/** A word for a menu label. Japanese runs on, so only its start is shown. */
const shortWord = (word: string) => {
  const max = isJapanese(word) ? 5 : 24
  return word.length > max ? word.slice(0, max) + '…' : word
}

const POS_ORDER: Sense['pos'][] = ['noun', 'verb', 'adjective', 'adverb']

/** Right-click menu (spelling, look up, cut/copy/paste) and the definition
 *  card. Also answers Ctrl D and "Define" on a selection. */
export function Dictionary() {
  const [menu, setMenu] = useState<{ params: MenuParams; at: WordAt | null } | null>(null)
  const [card, setCard] = useState<{ at: WordAt; suggestions: string[] } | null>(null)

  const lookUp = useCallback((at: WordAt, suggestions: string[] = []) => {
    setMenu(null)
    setCard({ at, suggestions })
  }, [])

  // Autocorrect follows the setting live, without restarting.
  useEffect(
    () =>
      startAutocorrect(() => {
        try {
          return (JSON.parse(localStorage.getItem('stillpage.prefs') ?? '{}') as { autocorrect?: boolean }).autocorrect !== false
        } catch {
          return true
        }
      }),
    [],
  )

  useEffect(() => {
    const bridge = window.stillpage
    const off = bridge?.onContextMenu?.((params) => {
      const selected = params.selectionText.trim()
      const at = selected && lookupable(selected) ? wordAtSelection() : wordAtPoint(params.x, params.y)
      setCard(null)
      setMenu({ params, at })
    })
    const onDefine = (e: Event) => lookUp((e as CustomEvent<WordAt>).detail)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        const at = wordAtSelection()
        if (!at) return
        e.preventDefault()
        lookUp(at)
      }
    }
    window.addEventListener('stillpage:define', onDefine)
    window.addEventListener('keydown', onKey)
    return () => {
      off?.()
      window.removeEventListener('stillpage:define', onDefine)
      window.removeEventListener('keydown', onKey)
    }
  }, [lookUp])

  return (
    <>
      {menu && <WordMenu {...menu} onLookUp={lookUp} onClose={() => setMenu(null)} />}
      {card && <DefineCard key={card.at.word + card.at.rect.left} at={card.at} suggestions={card.suggestions} onClose={() => setCard(null)} />}
    </>
  )
}

/** Keeps a floating box on screen, below its anchor or above when there's
 *  no room. */
function usePlace(anchor: { left: number; top: number; bottom: number }, width: number) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const { left: x, top: y, bottom } = anchor
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 200
    const left = Math.min(window.innerWidth - width - 10, Math.max(10, x))
    const below = bottom + 6
    const top = below + height > window.innerHeight - 10 ? Math.max(10, y - height - 6) : below
    setPlace({ left, top })
  }, [x, y, bottom, width])
  return { box, style: { left: place?.left ?? -9999, top: place?.top ?? 0, width } }
}

function useDismiss(box: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const away = (e: Event) => !box.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', away, true)
    document.addEventListener('scroll', away, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', away, true)
      document.removeEventListener('scroll', away, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', onClose)
    }
  }, [box, onClose])
}

function WordMenu({ params, at, onLookUp, onClose }: { params: MenuParams; at: WordAt | null; onLookUp: (at: WordAt, suggestions: string[]) => void; onClose: () => void }) {
  const { box, style } = usePlace({ left: params.x, top: params.y, bottom: params.y }, 230)
  useDismiss(box, onClose)
  const act = (action: Parameters<NonNullable<typeof window.stillpage>['editAction']>[0], word?: string) => {
    onClose()
    void window.stillpage?.editAction(action, word)
  }
  const misspelled = params.misspelledWord
  const items = [
    ...(misspelled
      ? [
          ...params.suggestions.slice(0, 5).map((s) => ({ label: s, strong: true, run: () => act('replace', s) })),
          ...(params.suggestions.length ? [] : [{ label: 'No spelling suggestions', disabled: true }]),
          { label: `Add “${misspelled}” to the dictionary`, run: () => act('learn', misspelled) },
          null,
        ]
      : []),
    ...(at ? [{ label: `Look up “${shortWord(at.word)}”`, hint: 'Ctrl D', run: () => onLookUp(at, misspelled ? params.suggestions : []) }, null] : []),
    ...(params.isEditable ? [{ label: 'Cut', hint: 'Ctrl X', disabled: !params.canCut, run: () => act('cut') }] : []),
    { label: 'Copy', hint: 'Ctrl C', disabled: !params.canCopy, run: () => act('copy') },
    ...(params.isEditable ? [{ label: 'Paste', hint: 'Ctrl V', disabled: !params.canPaste, run: () => act('paste') }] : []),
    { label: 'Select all', hint: 'Ctrl A', disabled: !params.canSelectAll, run: () => act('selectAll') },
  ]
  // Nothing useful to offer on a blank, read-only spot: no menu.
  if (!misspelled && !at && !params.isEditable && !params.canCopy) return null
  return (
    <div ref={box} className="word-menu" role="menu" style={style} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item === null ? (
          <div key={`sep${i}`} className="word-menu-sep" role="separator" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={`word-menu-item ${'strong' in item && item.strong ? 'strong' : ''}`}
            disabled={'disabled' in item && item.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={'run' in item ? item.run : undefined}
          >
            <span>{item.label}</span>
            {'hint' in item && item.hint && <kbd>{item.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}

function DefineCard({ at, suggestions, onClose }: { at: WordAt; suggestions: string[]; onClose: () => void }) {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { box, style } = usePlace(at.rect, 360)
  useDismiss(box, onClose)

  useEffect(() => {
    let alive = true
    define(at.word).then(
      (e) => alive && setEntry(e),
      (err: Error) => alive && setError(err.message),
    )
    return () => {
      alive = false
    }
  }, [at.word])

  const pick = (word: string) => {
    if (at.range) {
      replaceWord(at, word)
      onClose()
    } else {
      void navigator.clipboard.writeText(word)
      window.dispatchEvent(new CustomEvent('stillpage:toast', { detail: `Copied “${word}”` }))
    }
  }

  const head = entry?.lang === 'ja' ? (entry.words[0].kanji[0] ?? entry.words[0].kana[0]) : (entry?.word ?? at.word)
  const from = entry?.lang === 'ja' ? (entry.matched !== head ? entry.matched : null) : entry && entry.word.toLowerCase() !== at.word.toLowerCase() ? at.word : null

  return (
    <div ref={box} className="define-card" role="dialog" aria-label={`Definition of ${at.word}`} style={style}>
      <header className="define-head">
        {entry?.lang === 'ja' ? (
          <h3 lang="ja">
            <ruby>
              {head}
              {entry.words[0].kanji.length > 0 && <rt>{entry.words[0].kana[0]}</rt>}
            </ruby>
          </h3>
        ) : (
          <h3>{head}</h3>
        )}
        {from && (
          <span className="define-from">
            from “{from}”{entry?.lang === 'ja' && entry.words[0].reasons.length > 0 && `, ${entry.words[0].reasons.join(', ')}`}
          </span>
        )}
      </header>
      {entry === undefined && !error && <p className="define-quiet">Looking it up…</p>}
      {error && <p className="define-quiet">{error}</p>}
      {entry === null && (
        <>
          <p className="define-quiet">“{at.word}” isn't in the dictionary.</p>
          {suggestions.length > 0 && (
            <div className="define-chips">
              <span>Did you mean</span>
              {suggestions.slice(0, 5).map((s) => (
                <button key={s} className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {entry?.lang === 'en' && <English entry={entry} editable={Boolean(at.range)} onPick={pick} />}
      {entry?.lang === 'ja' && <Japanese entry={entry} />}
    </div>
  )
}

function English({ entry, editable, onPick }: { entry: EnglishEntry; editable: boolean; onPick: (word: string) => void }) {
  const [all, setAll] = useState(false)
  const groups = POS_ORDER.map((pos) => ({ pos, senses: entry.senses.filter((s) => s.pos === pos) })).filter((g) => g.senses.length)
  const limit = all ? Infinity : 3
  const hidden = groups.reduce((n, g) => n + Math.max(0, g.senses.length - limit), 0)
  return (
    <>
      {groups.map((g) => (
        <section key={g.pos} className="define-pos">
          <h4>{g.pos}</h4>
          <ol>
            {g.senses.slice(0, limit).map((s, i) => (
              <li key={i}>
                <p>{s.definition}</p>
                {s.examples[0] && <p className="define-example">“{s.examples[0]}”</p>}
                {s.synonyms.length > 0 && (
                  <div className="define-chips">
                    {s.synonyms.slice(0, 6).map((syn) => (
                      <button key={syn} className="chip" title={editable ? `Use “${syn}” instead` : `Copy “${syn}”`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(syn)}>
                        {syn}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {hidden > 0 && (
        <button className="define-more" onClick={() => setAll(true)}>
          {hidden} more {hidden === 1 ? 'sense' : 'senses'}
        </button>
      )}
      <p className="define-source">{editable ? 'Pick a word to put it in place. ' : ''}WordNet 3.0, Princeton University</p>
    </>
  )
}

function Japanese({ entry }: { entry: JapaneseEntry }) {
  return (
    <>
      {entry.words.map((w, i) => (
        <section key={i} className="define-pos define-ja">
          {i > 0 && (
            <h5 lang="ja">
              {w.kanji[0] ?? w.kana[0]}
              {w.kanji.length > 0 && <span className="define-reading">{w.kana[0]}</span>}
            </h5>
          )}
          {(w.kanji.length > 1 || w.kana.length > 1) && (
            <p className="define-forms" lang="ja">
              {[...w.kanji.slice(1), ...w.kana.slice(1)].join('、')}
            </p>
          )}
          <ol>
            {w.senses.slice(0, 5).map((s, j) => (
              <li key={j}>
                {s.pos.length > 0 && <span className="define-tag">{s.pos.join(', ')}</span>}
                <p>{s.glosses.join('; ')}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="define-source">JMdict, Electronic Dictionary Research and Development Group</p>
    </>
  )
}
