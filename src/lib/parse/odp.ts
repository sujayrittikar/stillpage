import type { Slide, SlideBlock } from '../types'
import { attr, children, inline, openOdf, type Writer } from './odf'

/** LibreOffice Impress presentations (.odp, .otp, flat .fodp), as readable
 *  slides: title, bullets with their levels, pictures, tables, speaker notes. */
export async function renderOdp(buf: ArrayBuffer): Promise<Slide[]> {
  const pkg = await openOdf(buf, 'presentation')
  if (!pkg) throw new Error('This presentation has no readable slides.')
  const w: Writer = { pkg, notes: [] }
  const plain = async (el: Element) => {
    const div = document.createElement('div')
    div.innerHTML = await inline(w, el)
    return (div.textContent ?? '').trim()
  }

  // Paragraphs inside a text box, flattening nested lists into levels.
  const paragraphs = async (box: Element, level = 0, inList = false): Promise<{ text: string; level: number; bullet: boolean }[]> => {
    const out: { text: string; level: number; bullet: boolean }[] = []
    for (const c of children(box)) {
      if (c.localName === 'p' || c.localName === 'h') {
        const text = await plain(c)
        if (text) out.push({ text, level, bullet: inList })
      } else if (c.localName === 'list') {
        for (const li of children(c)) out.push(...(await paragraphs(li, inList ? level + 1 : level, true)))
      }
    }
    return out
  }

  const slides: Slide[] = []
  for (const [index, page] of children(pkg.body, 'page').entries()) {
    const slide: Slide = { index: index + 1, title: '', blocks: [], notes: '' }

    const walk = async (parent: Element) => {
      for (const el of children(parent)) {
        if (el.localName === 'g') {
          await walk(el)
          continue
        }
        if (el.localName === 'notes') {
          const texts: string[] = []
          for (const f of children(el, 'frame')) {
            if (attr(f, 'presentation', 'class') !== 'notes') continue
            for (const box of children(f, 'text-box')) texts.push(...(await paragraphs(box)).map((p) => p.text))
          }
          slide.notes = texts.join('\n')
          continue
        }
        const role = attr(el, 'presentation', 'class') ?? ''
        if (['page-number', 'footer', 'date-time', 'header'].includes(role)) continue
        // Text lives in text boxes (frames) or directly in shapes.
        const boxes = el.localName === 'frame' ? children(el, 'text-box') : el.localName === 'custom-shape' || el.localName === 'rect' ? [el] : []
        for (const box of boxes) {
          const paras = await paragraphs(box)
          if (!paras.length) continue
          if (role === 'title' && !slide.title) {
            slide.title = paras.map((p) => p.text).join(' ')
          } else {
            const bullet = role === 'outline' || paras.some((p) => p.bullet) || paras.length > 1
            for (const p of paras) slide.blocks.push({ kind: 'p', text: p.text, level: p.level, bullet: bullet && role !== 'subtitle' })
          }
        }
        for (const img of el.localName === 'frame' ? children(el, 'image') : []) {
          const src = await pkg.image(attr(img, 'xlink', 'href') ?? '')
          if (src) slide.blocks.push({ kind: 'img', src })
        }
        for (const tbl of el.localName === 'frame' ? children(el, 'table') : []) {
          const rows: string[][] = []
          for (const tr of Array.from(tbl.getElementsByTagNameNS('*', 'table-row'))) {
            const cells: string[] = []
            for (const td of children(tr, 'table-cell')) cells.push((await Promise.all(children(td).map(plain))).join('\n'))
            rows.push(cells)
          }
          if (rows.length) slide.blocks.push({ kind: 'table', rows } satisfies SlideBlock)
        }
      }
    }
    await walk(page)
    // Slides the author named ("Agenda") keep that name; LibreOffice's own
    // "page3" is not worth showing.
    const name = attr(page, 'draw', 'name') ?? ''
    if (!slide.title && !/^(page|slide)\s*\d+$/i.test(name)) slide.title = name
    slides.push(slide)
  }
  return slides
}
