import JSZip from 'jszip'
import { escapeHtml } from '../sanitize'
import { dataUri, parseXml } from './zip'

// OpenDocument (LibreOffice) files keep formatting in named styles rather than
// on the text: <text:span text:style-name="T3"> is bold only because style T3
// says so. This module resolves those styles and turns the text model into
// clean HTML, shared by documents (.odt) and presentations (.odp).

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
}

interface TextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  position?: 'sup' | 'sub'
  mono?: boolean
  /** Paragraph styles that are really headings or quotes. */
  heading?: number
  quote?: boolean
  parent?: string
}

export interface OdfPackage {
  /** The root of the document content (office:body's child). */
  body: Element
  /** office:presentation's master pages etc. live elsewhere; we only need images. */
  image: (href: string) => Promise<string | null>
  styles: Map<string, TextStyle>
  /** Numbered or bulleted, per list style and level. */
  ordered: (listStyle: string | null, level: number) => boolean
}

const attr = (el: Element, ns: keyof typeof NS, name: string) => el.getAttributeNS(NS[ns], name)
const children = (el: Element, local?: string) => Array.from(el.children).filter((c) => !local || c.localName === local)

/** Opens a zipped ODF file, or a flat .fodt/.fodp XML file. */
export async function openOdf(buf: ArrayBuffer, kind: 'text' | 'presentation'): Promise<OdfPackage | null> {
  const bytes = new Uint8Array(buf)
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b
  let docs: Document[]
  let zip: JSZip | null = null
  if (zipped) {
    zip = await JSZip.loadAsync(buf)
    const content = zip.file('content.xml')
    if (!content) return null
    const styles = zip.file('styles.xml')
    docs = [parseXml(await content.async('text'))]
    if (styles) docs.unshift(parseXml(await styles.async('text')))
  } else {
    docs = [parseXml(new TextDecoder().decode(bytes))]
  }
  const main = docs[docs.length - 1]
  const body = main.getElementsByTagNameNS(NS.office, kind)[0]
  if (!body) return null

  const styles = new Map<string, TextStyle>()
  const listKinds = new Map<string, boolean[]>()
  for (const doc of docs) {
    for (const el of Array.from(doc.getElementsByTagNameNS(NS.style, 'style'))) {
      const name = attr(el, 'style', 'name')
      if (name) styles.set(name, readStyle(el))
    }
    for (const el of Array.from(doc.getElementsByTagNameNS(NS.text, 'list-style'))) {
      const name = attr(el, 'style', 'name')
      if (!name) continue
      const levels: boolean[] = []
      for (const lvl of Array.from(el.children)) {
        const n = Number(attr(lvl, 'text', 'level') ?? 1) - 1
        levels[n] = lvl.localName === 'list-level-style-number' && Boolean(attr(lvl, 'style', 'num-format'))
      }
      listKinds.set(name, levels)
    }
  }

  return {
    body,
    styles,
    image: async (href) => (zip ? dataUri(zip, href.replace(/^\.\//, '')) : null),
    ordered: (listStyle, level) => Boolean(listStyle && listKinds.get(listStyle)?.[level]),
  }
}

function readStyle(el: Element): TextStyle {
  const s: TextStyle = { parent: attr(el, 'style', 'parent-style-name') ?? undefined }
  const display = (attr(el, 'style', 'display-name') ?? attr(el, 'style', 'name') ?? '').toLowerCase().replace(/_20_/g, ' ')
  const heading = /^heading (\d)$/.exec(display)
  if (heading) s.heading = Number(heading[1])
  else if (display === 'title') s.heading = 1
  else if (display === 'subtitle') s.heading = 2
  if (display === 'quotations' || display === 'quote') s.quote = true
  if (display === 'source text' || display === 'preformatted text') s.mono = true
  if (display === 'strong emphasis' || display === 'strong') s.bold = true
  if (display === 'emphasis') s.italic = true

  const props = Array.from(el.children).find((c) => c.localName === 'text-properties')
  if (props) {
    const weight = attr(props, 'fo', 'font-weight')
    if (weight) s.bold = weight === 'bold' || Number(weight) >= 600
    const style = attr(props, 'fo', 'font-style')
    if (style) s.italic = style === 'italic' || style === 'oblique'
    const underline = attr(props, 'style', 'text-underline-style')
    if (underline) s.underline = underline !== 'none'
    const strike = attr(props, 'style', 'text-line-through-style')
    if (strike) s.strike = strike !== 'none'
    const position = attr(props, 'style', 'text-position')
    if (position?.startsWith('super')) s.position = 'sup'
    else if (position?.startsWith('sub')) s.position = 'sub'
    const font = (attr(props, 'style', 'font-name') ?? '').toLowerCase()
    if (/mono|courier|consolas|menlo/.test(font)) s.mono = true
  }
  return s
}

/** A style with everything it inherits filled in. */
export function resolve(pkg: OdfPackage, name: string | null): TextStyle {
  const out: TextStyle = {}
  const seen = new Set<string>()
  const chain: TextStyle[] = []
  let current = name
  while (current && !seen.has(current)) {
    seen.add(current)
    const s = pkg.styles.get(current)
    if (!s) break
    chain.unshift(s)
    current = s.parent ?? null
  }
  for (const s of chain) {
    for (const [k, v] of Object.entries(s)) if (v !== undefined && k !== 'parent') (out as Record<string, unknown>)[k] = v
  }
  return out
}

function wrap(html: string, s: TextStyle): string {
  if (!html) return html
  if (s.mono) html = `<code>${html}</code>`
  if (s.position) html = `<${s.position}>${html}</${s.position}>`
  if (s.strike) html = `<s>${html}</s>`
  if (s.underline) html = `<u>${html}</u>`
  if (s.italic) html = `<em>${html}</em>`
  if (s.bold) html = `<strong>${html}</strong>`
  return html
}

export interface Writer {
  pkg: OdfPackage
  notes: string[]
}

/** Text runs inside a paragraph or heading. */
export async function inline(w: Writer, el: Element): Promise<string> {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(node.textContent ?? '')
      continue
    }
    if (!(node instanceof Element)) continue
    switch (node.localName) {
      case 's':
        out += ' '.repeat(Number(attr(node, 'text', 'c') ?? 1))
        break
      case 'tab':
        out += ' '
        break
      case 'line-break':
        out += '<br>'
        break
      case 'span':
        out += wrap(await inline(w, node), resolve(w.pkg, attr(node, 'text', 'style-name')))
        break
      case 'a': {
        const href = attr(node, 'xlink', 'href') ?? ''
        const text = await inline(w, node)
        out += /^(https?:|mailto:)/.test(href) ? `<a href="${escapeHtml(href)}">${text}</a>` : text
        break
      }
      case 'note': {
        const bodyEl = children(node, 'note-body')[0]
        if (!bodyEl) break
        const n = w.notes.length + 1
        w.notes.push((await blocks(w, bodyEl)).replace(/^<p>|<\/p>$/g, ''))
        out += `<sup><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>`
        break
      }
      case 'frame':
        out += await frame(w, node)
        break
      case 'bookmark':
      case 'bookmark-start':
      case 'bookmark-end':
      case 'soft-page-break':
      case 'annotation':
      case 'annotation-end':
      case 'sequence-decls':
        break
      default:
        // Fields (page numbers, dates, cross-references) show their current text.
        out += await inline(w, node)
    }
  }
  return out
}

async function frame(w: Writer, el: Element): Promise<string> {
  let out = ''
  for (const c of children(el)) {
    if (c.localName === 'image') {
      const src = await w.pkg.image(attr(c, 'xlink', 'href') ?? '')
      if (src) out += `<img src="${src}" alt="">`
    } else if (c.localName === 'text-box') {
      out += await blocks(w, c)
    }
  }
  return out
}

async function list(w: Writer, el: Element, level: number, inherited: string | null): Promise<string> {
  const style = attr(el, 'text', 'style-name') ?? inherited
  const tag = w.pkg.ordered(style, level) ? 'ol' : 'ul'
  let items = ''
  for (const li of children(el)) {
    if (li.localName !== 'list-item' && li.localName !== 'list-header') continue
    let inner = ''
    for (const c of children(li)) {
      inner += c.localName === 'list' ? await list(w, c, level + 1, style) : await block(w, c)
    }
    // A list item holding a single paragraph reads better without the <p>.
    items += `<li>${inner.replace(/^<p>(.*)<\/p>$/s, '$1')}</li>`
  }
  return items ? `<${tag}>${items}</${tag}>` : ''
}

async function table(w: Writer, el: Element): Promise<string> {
  const row = async (tr: Element, cell: 'th' | 'td') => {
    let cells = ''
    for (const td of children(tr)) {
      if (td.localName !== 'table-cell') continue
      const span = Number(attr(td, 'table', 'number-columns-spanned') ?? 1)
      const inner = (await blocks(w, td)).replace(/^<p>(.*)<\/p>$/s, '$1')
      cells += `<${cell}${span > 1 ? ` colspan="${span}"` : ''}>${inner}</${cell}>`
    }
    return `<tr>${cells}</tr>`
  }
  let head = ''
  let body = ''
  for (const c of children(el)) {
    if (c.localName === 'table-header-rows') for (const tr of children(c, 'table-row')) head += await row(tr, 'th')
    else if (c.localName === 'table-row') body += await row(c, 'td')
    else if (c.localName === 'table-rows') for (const tr of children(c, 'table-row')) body += await row(tr, 'td')
  }
  return `<table>${head ? `<thead>${head}</thead>` : ''}<tbody>${body}</tbody></table>`
}

export async function block(w: Writer, el: Element): Promise<string> {
  switch (el.localName) {
    case 'h': {
      const level = Math.min(6, Number(attr(el, 'text', 'outline-level') ?? 1))
      const text = await inline(w, el)
      return text.trim() ? `<h${level}>${text}</h${level}>` : ''
    }
    case 'p': {
      const s = resolve(w.pkg, attr(el, 'text', 'style-name'))
      const text = await inline(w, el)
      if (!text.replace(/<br>|\s/g, '')) return text.includes('<img') ? `<p>${text}</p>` : ''
      if (s.heading) return `<h${s.heading}>${text}</h${s.heading}>`
      if (s.mono) return `<pre><code>${text}</code></pre>`
      const p = `<p>${wrap(text, { bold: s.bold, italic: s.italic })}</p>`
      return s.quote ? `<blockquote>${p}</blockquote>` : p
    }
    case 'list':
      return list(w, el, 0, null)
    case 'table':
      return table(w, el)
    case 'section':
    case 'text-box':
    case 'index-body':
      return blocks(w, el)
    case 'table-of-content':
    case 'alphabetical-index':
    case 'illustration-index':
    case 'bibliography': {
      // Keep the entries, drop the index machinery.
      const bodyEl = children(el, 'index-body')[0]
      return bodyEl ? `<nav>${await blocks(w, bodyEl)}</nav>` : ''
    }
    case 'frame':
      return frame(w, el)
    default:
      return ''
  }
}

export async function blocks(w: Writer, el: Element): Promise<string> {
  let out = ''
  for (const c of children(el)) out += await block(w, c)
  return out
}

/** Footnotes collected while writing, as an ordered list for the end. */
export function footnotes(w: Writer): string {
  if (!w.notes.length) return ''
  return `<aside><ol>${w.notes.map((n, i) => `<li id="fn-${i + 1}">${n}</li>`).join('')}</ol></aside>`
}

export { NS, attr, children }
