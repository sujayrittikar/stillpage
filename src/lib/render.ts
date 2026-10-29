import { CODE_LANG } from './formats'
import { getBlob } from './library'
import type { Item, Rendered } from './types'

const cache = new Map<string, Promise<Rendered>>()

/** Parses a stored document once and shares the result between panes. */
export function renderItem(item: Item): Promise<Rendered> {
  let p = cache.get(item.id)
  if (!p) {
    p = load(item)
    p.catch(() => cache.delete(item.id))
    cache.set(item.id, p)
  }
  return p
}

async function load(item: Item): Promise<Rendered> {
  const blob = await getBlob(item.id)
  if (!blob) throw new Error('This file is no longer in your library. Open it again from disk.')
  switch (item.format) {
    case 'pdf':
      return { type: 'pdf', data: await blob.arrayBuffer() }
    case 'md': {
      const { renderMarkdown } = await import('./parse/markdown')
      return { type: 'html', html: renderMarkdown(await blob.text()) }
    }
    case 'docx': {
      const { renderDocx } = await import('./parse/docx')
      return { type: 'html', html: await renderDocx(await blob.arrayBuffer()) }
    }
    case 'pptx': {
      const { renderPptx } = await import('./parse/pptx')
      return { type: 'slides', slides: await renderPptx(await blob.arrayBuffer()) }
    }
    case 'sheet': {
      const { renderSheet } = await import('./parse/sheet')
      const textual = item.ext === 'csv' || item.ext === 'tsv'
      return { type: 'sheet', sheets: renderSheet(textual ? await blob.text() : await blob.arrayBuffer()) }
    }
    case 'epub': {
      const { renderEpub } = await import('./parse/epub')
      return { type: 'html', html: await renderEpub(await blob.arrayBuffer()) }
    }
    case 'odt': {
      const { renderOdt } = await import('./parse/odt')
      return { type: 'html', html: await renderOdt(await blob.arrayBuffer()) }
    }
    case 'rtf': {
      const { renderRtf } = await import('./parse/rtf')
      return { type: 'html', html: renderRtf(await blob.text()), variant: 'plain' }
    }
    case 'ipynb': {
      const { renderIpynb } = await import('./parse/ipynb')
      return { type: 'html', html: renderIpynb(await blob.text()) }
    }
    case 'html': {
      const { clean } = await import('./sanitize')
      const doc = new DOMParser().parseFromString(await blob.text(), 'text/html')
      return { type: 'html', html: clean(doc.body.innerHTML) }
    }
    case 'txt': {
      const { renderPlainText } = await import('./parse/text')
      return { type: 'html', html: renderPlainText(await blob.text()), variant: 'plain' }
    }
    case 'code': {
      const { renderCode } = await import('./parse/text')
      return { type: 'html', html: renderCode(await blob.text(), CODE_LANG[item.ext ?? '']), variant: 'code' }
    }
    case 'image':
      return { type: 'image', url: URL.createObjectURL(blob) }
    default:
      throw new Error('Stillpage does not know how to read this file.')
  }
}
