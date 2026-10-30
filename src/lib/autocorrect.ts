// Fixes common typos as you type ("teh " → "the ", "dont " → "don't "),
// in any writing surface: notes, files edited as pages, Markdown source.
// It only ever touches a word on the list, never a real word, and never in
// code. Backspace straight after a fix puts your word back, and that word is
// then left alone for the rest of the session.

let fixes: Map<string, string> | null = null
let loading: Promise<void> | null = null

function load() {
  loading ??= fetch(new URL('./dict/autocorrect.json.gz', document.baseURI))
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error('missing')
      const data = (await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json()) as Record<string, string>
      fixes = new Map(Object.entries(data))
    })
    .catch(() => {
      fixes = new Map()
    })
  return loading
}

// What ends a word: a space or punctuation.
const BOUNDARY = /^[\s.,;:!?)\]"'”’…]$/u
const WORD_BEFORE = /(?:^|[^\p{L}\d'’-])(\p{L}+)(\P{L})$/u
const declined = new Set<string>()
let last: { node: Text; text: string; original: string } | null = null

/** "Teh" becomes "The", "TEH" becomes "THE"; contractions keep their I. */
function fitCase(typed: string, fix: string): string {
  if (typed === typed.toUpperCase() && typed.length > 1) return fix.toUpperCase()
  if (/^\p{Lu}/u.test(typed)) return fix[0].toUpperCase() + fix.slice(1)
  return fix
}

/** Writing surfaces only: not code, formulas, or fields with spellcheck off. */
function writable(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement
  if (!el?.closest('[contenteditable="true"]')) return false
  if (el.closest('code, pre, .math-editor, [data-type$="-math"]')) return false
  return el.closest('[spellcheck]')?.getAttribute('spellcheck') !== 'false'
}

function select(node: Text, from: number, to: number) {
  const range = document.createRange()
  range.setStart(node, from)
  range.setEnd(node, to)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function afterTyping() {
  const sel = window.getSelection()
  const node = sel?.focusNode
  if (!sel?.isCollapsed || !(node instanceof Text) || !fixes || !writable(node)) return
  const offset = sel.focusOffset
  const m = WORD_BEFORE.exec(node.data.slice(0, offset))
  if (!m || !BOUNDARY.test(m[2])) return
  const [, typed, char] = m
  const lower = typed.toLowerCase()
  // A lone capital I is a word in its own right; only "i" needs fixing.
  const fix = typed === 'I' ? null : fixes.get(lower)
  if (!fix || declined.has(lower)) return
  const fitted = fitCase(typed, fix)
  const start = offset - typed.length - char.length
  select(node, start, offset)
  document.execCommand('insertText', false, fitted + char)
  const now = window.getSelection()?.focusNode
  last = now instanceof Text ? { node: now, text: fitted + char, original: typed + char } : null
}

export function startAutocorrect(enabled: () => boolean): () => void {
  const onInput = (e: Event) => {
    const input = e as InputEvent
    if (input.inputType !== 'insertText' || !input.data || !BOUNDARY.test(input.data) || input.isComposing || !enabled()) return
    if (!fixes) {
      void load()
      return
    }
    // Let the editor take in the keystroke first.
    setTimeout(afterTyping, 0)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return
    const undo = last
    last = null
    if (e.key !== 'Backspace' || !undo || e.ctrlKey || e.altKey) return
    const sel = window.getSelection()
    if (!sel?.isCollapsed || sel.focusNode !== undo.node) return
    const offset = sel.focusOffset
    if (!undo.node.data.slice(0, offset).endsWith(undo.text)) return
    e.preventDefault()
    declined.add(undo.original.slice(0, -1).toLowerCase())
    select(undo.node, offset - undo.text.length, offset)
    document.execCommand('insertText', false, undo.original)
  }
  // Start loading early so the first typo is caught.
  if (enabled()) void load()
  document.addEventListener('input', onInput, true)
  document.addEventListener('keydown', onKey, true)
  return () => {
    document.removeEventListener('input', onInput, true)
    document.removeEventListener('keydown', onKey, true)
  }
}
