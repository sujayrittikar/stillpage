import type JSZip from 'jszip'

export function resolvePath(baseDir: string, rel: string): string {
  const parts = baseDir ? baseDir.split('/').filter(Boolean) : []
  const clean = decodeURIComponent(rel.split('#')[0].split('?')[0])
  if (clean.startsWith('/')) parts.length = 0
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export function dirOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf',
}

/** Reads an image out of the archive as a data: URI (sanitiser-safe, unlike blob:). */
export async function dataUri(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path)
  if (!file) return null
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME[ext]
  if (!mime || mime.includes('emf') || mime.includes('wmf')) return null
  return `data:${mime};base64,${await file.async('base64')}`
}

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

export function byTag(root: Element | Document, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local))
}
