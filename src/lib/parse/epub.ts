import JSZip from 'jszip'
import { clean } from '../sanitize'
import { byTag, dataUri, dirOf, parseXml, resolvePath } from './zip'

export async function renderEpub(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const container = parseXml(await zip.file('META-INF/container.xml')!.async('text'))
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('This EPUB has no package file.')
  const opf = parseXml(await zip.file(opfPath)!.async('text'))
  const base = dirOf(opfPath)

  const manifest = new Map<string, string>()
  for (const item of byTag(opf, 'item')) {
    manifest.set(item.getAttribute('id') ?? '', item.getAttribute('href') ?? '')
  }

  const sections: string[] = []
  for (const ref of byTag(opf, 'itemref')) {
    const href = manifest.get(ref.getAttribute('idref') ?? '')
    if (!href) continue
    const path = resolvePath(base, href)
    const file = zip.file(path)
    if (!file) continue
    const text = await file.async('text')
    let doc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
    if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html')
    const body = doc.getElementsByTagName('body')[0]
    if (!body) continue

    for (const img of Array.from(body.querySelectorAll('img'))) {
      const src = img.getAttribute('src')
      const uri = src ? await dataUri(zip, resolvePath(dirOf(path), src)) : null
      if (uri) img.setAttribute('src', uri)
      else img.remove()
    }
    // SVG-wrapped cover images.
    for (const image of Array.from(body.getElementsByTagNameNS('*', 'image'))) {
      const src = image.getAttribute('href') ?? image.getAttribute('xlink:href')
      const uri = src ? await dataUri(zip, resolvePath(dirOf(path), src)) : null
      const svg = image.closest('svg')
      if (uri && svg) {
        const img = doc.createElement('img')
        img.setAttribute('src', uri)
        svg.replaceWith(img)
      }
    }
    sections.push(`<section class="chapter">${body.innerHTML}</section>`)
  }
  return clean(sections.join('\n'))
}
