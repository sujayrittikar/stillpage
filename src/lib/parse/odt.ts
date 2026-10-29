import JSZip from 'jszip'
import { clean, escapeHtml } from '../sanitize'
import { dataUri, parseXml } from './zip'

function inline(el: Element): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += escapeHtml(node.textContent ?? '')
    else if (node instanceof Element) {
      if (node.localName === 's') out += ' '.repeat(Number(node.getAttribute('text:c') ?? 1))
      else if (node.localName === 'tab') out += '\t'
      else if (node.localName === 'line-break') out += '<br>'
      else if (node.localName === 'note') continue
      else out += inline(node)
    }
  }
  return out
}

export async function renderOdt(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const xml = parseXml(await zip.file('content.xml')!.async('text'))
  const body = xml.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0]
  if (!body) return ''

  const block = async (el: Element): Promise<string> => {
    switch (el.localName) {
      case 'h': {
        const level = Math.min(6, Number(el.getAttribute('text:outline-level') ?? 1))
        return `<h${level}>${inline(el)}</h${level}>`
      }
      case 'p': {
        const frames = Array.from(el.getElementsByTagNameNS('*', 'image'))
        let imgs = ''
        for (const img of frames) {
          const uri = await dataUri(zip, img.getAttribute('xlink:href') ?? '')
          if (uri) imgs += `<img src="${uri}" alt="">`
        }
        const text = inline(el)
        return text.trim() || imgs ? `<p>${text}${imgs}</p>` : ''
      }
      case 'list': {
        const lis = await Promise.all(
          Array.from(el.children).filter((c) => c.localName === 'list-item').map(async (li) => `<li>${(await Promise.all(Array.from(li.children).map(block))).join('')}</li>`),
        )
        return `<ul>${lis.join('')}</ul>`
      }
      case 'table': {
        const rows = Array.from(el.getElementsByTagNameNS('*', 'table-row')).map(
          (tr) => `<tr>${Array.from(tr.getElementsByTagNameNS('*', 'table-cell')).map((td) => `<td>${inline(td)}</td>`).join('')}</tr>`,
        )
        return `<table>${rows.join('')}</table>`
      }
      case 'section':
        return (await Promise.all(Array.from(el.children).map(block))).join('')
      default:
        return ''
    }
  }
  return clean((await Promise.all(Array.from(body.children).map(block))).join('\n'))
}
