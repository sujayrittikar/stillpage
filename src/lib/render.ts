import { CODE_LANG } from './formats'
import { getBlob, getOriginal, setOriginal } from './library'
import type { DocView, Item, Rendered } from './types'

const cache = new Map<string, Promise<Rendered>>()

/** LibreOffice is needed to show this file and isn't installed. */
export class NeedsOffice extends Error {}

/** Parses a stored document once per view and shares the result between panes. */
export function renderItem(item: Item, view: DocView = 'reading'): Promise<Rendered> {
  const original = view === 'original' || item.format === 'office'
  const key = `${item.id}:${original ? 'original' : 'reading'}`
  let p = cache.get(key)
  if (!p) {
    p = original ? loadOriginal(item) : load(item)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** The author's own pages, drawn by LibreOffice and kept after the first time. */
async function loadOriginal(item: Item): Promise<Rendered> {
  const saved = await getOriginal(item.id)
  if (saved) return { type: 'pdf', data: await saved.arrayBuffer() }
  const bridge = window.stillpage
  if (!bridge?.convertToPdf) throw new NeedsOffice()
  const blob = await getBlob(item.id)
  if (!blob) throw new Error('This file is no longer in your library. Open it again from disk.')
  const result = await bridge.convertToPdf(`${item.title}.${item.ext ?? 'doc'}`, new Uint8Array(await blob.arrayBuffer()))
  if (result.error === 'no-office') throw new NeedsOffice()
  if (!result.pdf) throw new Error(result.error ?? 'This file could not be opened.')
  const pdf = new Blob([result.pdf as BlobPart], { type: 'application/pdf' })
  await setOriginal(item.id, pdf)
  return { type: 'pdf', data: await pdf.arrayBuffer() }
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
    case 'odp': {
      const { renderOdp } = await import('./parse/odp')
      return { type: 'slides', slides: await renderOdp(await blob.arrayBuffer()) }
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
