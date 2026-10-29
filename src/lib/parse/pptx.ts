import JSZip from 'jszip'
import type { Slide, SlideBlock } from '../types'
import { byTag, dataUri, dirOf, parseXml, resolvePath } from './zip'

async function rels(zip: JSZip, partPath: string): Promise<Map<string, { target: string; type: string }>> {
  const relPath = `${dirOf(partPath)}/_rels/${partPath.split('/').pop()}.rels`
  const map = new Map<string, { target: string; type: string }>()
  const file = zip.file(relPath)
  if (!file) return map
  for (const rel of byTag(parseXml(await file.async('text')), 'Relationship')) {
    map.set(rel.getAttribute('Id') ?? '', {
      target: resolvePath(dirOf(partPath), rel.getAttribute('Target') ?? ''),
      type: rel.getAttribute('Type') ?? '',
    })
  }
  return map
}

function paragraphText(p: Element): string {
  let out = ''
  for (const node of Array.from(p.getElementsByTagNameNS('*', '*'))) {
    if (node.localName === 't') out += node.textContent ?? ''
    else if (node.localName === 'br') out += '\n'
  }
  return out
}

export async function renderPptx(buf: ArrayBuffer): Promise<Slide[]> {
  const zip = await JSZip.loadAsync(buf)
  const presPath = 'ppt/presentation.xml'
  const pres = parseXml(await zip.file(presPath)!.async('text'))
  const presRels = await rels(zip, presPath)
  const slidePaths = byTag(pres, 'sldId')
    .map((s) => presRels.get(s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '')?.target)
    .filter((p): p is string => !!p)

  const slides: Slide[] = []
  for (const [index, path] of slidePaths.entries()) {
    const file = zip.file(path)
    if (!file) continue
    const xml = parseXml(await file.async('text'))
    const slideRels = await rels(zip, path)
    const slide: Slide = { index: index + 1, title: '', blocks: [], notes: '' }

    const walk = async (parent: Element) => {
      for (const el of Array.from(parent.children)) {
        if (el.localName === 'grpSp') await walk(el)
        else if (el.localName === 'sp') {
          const ph = byTag(el, 'ph')[0]
          const type = ph?.getAttribute('type') ?? (ph ? 'body' : '')
          const paras = byTag(el, 'p')
            .filter((p) => p.namespaceURI?.includes('drawingml'))
            .map((p) => ({ text: paragraphText(p).trim(), level: Number(byTag(p, 'pPr')[0]?.getAttribute('lvl') ?? 0) }))
            .filter((p) => p.text)
          if (!paras.length) continue
          if ((type === 'title' || type === 'ctrTitle') && !slide.title) {
            slide.title = paras.map((p) => p.text).join(' ')
          } else if (type === 'sldNum' || type === 'dt' || type === 'ftr') {
            continue
          } else {
            const bullet = type === 'body' || type === 'obj' || paras.length > 1
            for (const p of paras) slide.blocks.push({ kind: 'p', text: p.text, level: p.level, bullet })
          }
        } else if (el.localName === 'pic') {
          const embed = byTag(el, 'blip')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')
          const target = embed ? slideRels.get(embed)?.target : undefined
          const src = target ? await dataUri(zip, target) : null
          if (src) slide.blocks.push({ kind: 'img', src })
        } else if (el.localName === 'graphicFrame') {
          const tbl = byTag(el, 'tbl')[0]
          if (tbl) {
            const rows = byTag(tbl, 'tr').map((tr) => byTag(tr, 'tc').map((tc) => byTag(tc, 'p').map(paragraphText).join('\n').trim()))
            slide.blocks.push({ kind: 'table', rows } satisfies SlideBlock)
          }
        }
      }
    }
    const tree = byTag(xml, 'spTree')[0]
    if (tree) await walk(tree)

    for (const rel of slideRels.values()) {
      if (!rel.type.endsWith('/notesSlide')) continue
      const notesFile = zip.file(rel.target)
      if (!notesFile) continue
      const notesXml = parseXml(await notesFile.async('text'))
      slide.notes = byTag(notesXml, 'sp')
        .filter((sp) => byTag(sp, 'ph')[0]?.getAttribute('type') === 'body')
        .flatMap((sp) => byTag(sp, 'p').map(paragraphText))
        .join('\n')
        .trim()
    }
    slides.push(slide)
  }
  return slides
}
