import { useEffect, useRef } from 'react'
import { basicSetup, minimalSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import { languages } from '@codemirror/language-data'
import { tags as t } from '@lezer/highlight'

// The same low-chroma colours as the reading view's code.
const colours = HighlightStyle.define([
  { tag: [t.comment, t.quote], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier], color: 'var(--accent)' },
  { tag: [t.string, t.regexp, t.special(t.string), t.attributeValue], color: 'var(--code-str)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.literal], color: 'var(--code-num)' },
  { tag: [t.heading, t.function(t.definition(t.variableName)), t.className, t.tagName], color: 'var(--ink)', fontWeight: '600' },
  { tag: [t.propertyName, t.attributeName, t.typeName, t.variableName], color: 'var(--ink-2)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--muted)' },
  { tag: t.invalid, color: '#9b4b45' },
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--ink)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '13.5px', lineHeight: '1.7' },
  '.cm-content': { padding: '28px 0 30vh', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--muted)', paddingLeft: '12px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 70%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-2)', border: 'none', color: 'var(--muted)' },
})

// Prose (Markdown source, plain text) reads as a page: wrapped, in the
// reading column, without line numbers.
const proseTheme = EditorView.theme({
  '.cm-scroller': { fontSize: 'calc(var(--read-size) * 0.8)', lineHeight: '1.75' },
  '.cm-content': { maxWidth: 'calc(var(--read-measure) * 1.15)', margin: '0 auto', padding: '56px 36px 40vh' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
})

interface Props {
  text: string
  /** Used to pick the language. */
  filename: string
  prose?: boolean
  onChange: (text: string) => void
}

/** A plain, quiet code editor. The text is only read on mount and when it
 *  changes from outside; typing never re-renders React. */
export function CodeEditor({ text, filename, prose = false, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  useEffect(() => {
    const language = new Compartment()
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          prose ? minimalSetup : basicSetup,
          prose ? [EditorView.lineWrapping, proseTheme] : [],
          keymap.of([indentWithTab]),
          theme,
          syntaxHighlighting(colours),
          language.of([]),
          EditorView.contentAttributes.of({ spellcheck: prose ? 'true' : 'false', autocorrect: prose ? 'on' : 'off' }),
          EditorView.updateListener.of((u) => u.docChanged && changed.current(u.state.doc.toString())),
        ],
      }),
    })
    view.current = v
    const match = LanguageDescription.matchFilename(languages, filename)
    void match?.load().then((support) => v.dispatch({ effects: language.reconfigure(support) }))
    return () => {
      v.destroy()
      view.current = null
    }
    // The document is handed over once; outside changes arrive below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, prose])

  // A new version from outside (the file changed on disk) replaces ours.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== text) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
  }, [text])

  return <div ref={host} className={`code-editor ${prose ? 'prose-source' : ''}`} />
}
