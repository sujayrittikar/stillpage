import JSZip from 'jszip'
import { hasMark, linkOf, picture, textOf, type PMNode } from './shared'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Runs of spaces and tabs need ODF's own elements, or they collapse. */
const spaced = (s: string) =>
  esc(s)
    .replace(/\t/g, '<text:tab/>')
    .replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:styles>
<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.21cm"/><style:text-properties fo:font-size="11pt"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold"/></style:style>
${[20, 16, 14, 12, 11, 11].map((pt, i) => `<style:style style:name="Heading_20_${i + 1}" style:display-name="Heading ${i + 1}" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="${i + 1}"><style:text-properties fo:font-size="${pt}pt"/></style:style>`).join('\n')}
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0cm"/><style:text-properties style:font-name="Liberation Mono" fo:font-family="'Liberation Mono'" fo:font-size="10pt"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard"/>
<style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents"><style:text-properties fo:font-weight="bold"/></style:style>
</office:styles>
</office:document-styles>`

const listStyle = (name: string, numbered: boolean) =>
  `<text:list-style style:name="${name}">${Array.from({ length: 6 }, (_, i) =>
    numbered
      ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(i + 1) * 1.27}cm"/></style:list-level-properties></text:list-level-style-number>`
      : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${['•', '◦', '▪'][i % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(i + 1) * 1.27}cm"/></style:list-level-properties></text:list-level-style-bullet>`,
  ).join('')}</text:list-style>`

class Writer {
  /** Text styles made for each mix of bold, italic, underline, strike and code. */
  spans = new Map<string, string>()
  pictures: { path: string; bytes: Uint8Array; mime: string }[] = []

  spanStyle(n: PMNode): string | null {
    const key = ['bold', 'italic', 'underline', 'strike', 'code'].filter((m) => hasMark(n, m)).join('+')
    if (!key) return null
    if (!this.spans.has(key)) this.spans.set(key, `T${this.spans.size + 1}`)
    return this.spans.get(key)!
  }

  async inline(nodes: PMNode[] = []): Promise<string> {
    let out = ''
    for (const n of nodes) {
      if (n.type === 'hardBreak') out += '<text:line-break/>'
      else if (n.type === 'image') out += await this.image(n)
      else if (n.type === 'inlineMath') out += `<text:span text:style-name="${this.spanStyle({ type: 'text', marks: [{ type: 'code' }] })}">${esc(textOf(n))}</text:span>`
      else if (n.text !== undefined) {
        const style = this.spanStyle(n)
        let piece = spaced(n.text)
        if (style) piece = `<text:span text:style-name="${style}">${piece}</text:span>`
        const href = linkOf(n)
        if (href) piece = `<text:a xlink:type="simple" xlink:href="${esc(href)}">${piece}</text:a>`
        out += piece
      }
    }
    return out
  }

  async image(n: PMNode): Promise<string> {
    const pic = await picture(String(n.attrs?.src ?? ''))
    if (!pic) return ''
    const path = `Pictures/image${this.pictures.length + 1}.${pic.type}`
    this.pictures.push({ path, bytes: pic.bytes, mime: pic.mime })
    const cm = (px: number) => `${((px * 2.54) / 96).toFixed(3)}cm`
    return `<draw:frame draw:name="Image${this.pictures.length}" text:anchor-type="as-char" svg:width="${cm(pic.width)}" svg:height="${cm(pic.height)}"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
  }

  async blocks(nodes: PMNode[] = [], para = 'Standard'): Promise<string> {
    let out = ''
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph':
          out += `<text:p text:style-name="${para}">${await this.inline(n.content)}</text:p>`
          break
        case 'heading': {
          const level = Math.min(6, Number(n.attrs?.level ?? 1))
          out += `<text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${await this.inline(n.content)}</text:h>`
          break
        }
        case 'bulletList':
        case 'orderedList':
          out += await this.list(n, n.type === 'orderedList' ? 'Numbers' : 'Bullets')
          break
        case 'taskList':
          for (const item of n.content ?? []) {
            const [first, ...rest] = item.content ?? []
            out += `<text:p text:style-name="${para}">${item.attrs?.checked ? '☑' : '☐'} ${await this.inline(first?.content)}</text:p>${await this.blocks(rest, para)}`
          }
          break
        case 'blockquote':
          out += await this.blocks(n.content, 'Quotations')
          break
        case 'codeBlock':
          out += textOf(n)
            .split('\n')
            .map((line) => `<text:p text:style-name="Preformatted_20_Text">${spaced(line)}</text:p>`)
            .join('')
          break
        case 'blockMath':
          out += `<text:p text:style-name="Preformatted_20_Text">${esc(textOf(n))}</text:p>`
          break
        case 'horizontalRule':
          out += `<text:p text:style-name="Standard">—</text:p>`
          break
        case 'image':
          out += `<text:p text:style-name="${para}">${await this.image(n)}</text:p>`
          break
        case 'table':
          out += await this.table(n)
          break
        default:
          if (n.content) out += await this.blocks(n.content, para)
      }
    }
    return out
  }

  async list(n: PMNode, style: string): Promise<string> {
    let items = ''
    for (const item of n.content ?? []) items += `<text:list-item>${await this.blocks(item.content)}</text:list-item>`
    return `<text:list text:style-name="${style}">${items}</text:list>`
  }

  async table(n: PMNode): Promise<string> {
    const rows = n.content ?? []
    const cols = Math.max(1, ...rows.map((r) => r.content?.length ?? 0))
    let out = `<table:table table:name="Table${Math.random().toString(36).slice(2, 7)}"><table:table-column table:number-columns-repeated="${cols}"/>`
    for (const row of rows) {
      out += '<table:table-row>'
      for (const cell of row.content ?? []) {
        const inner = await this.blocks(cell.content, cell.type === 'tableHeader' ? 'Table_20_Heading' : 'Table_20_Contents')
        out += `<table:table-cell office:value-type="string">${inner || '<text:p/>'}</table:table-cell>`
      }
      out += '</table:table-row>'
    }
    return out + '</table:table>'
  }

  automaticStyles(): string {
    const props: Record<string, string> = {
      bold: 'fo:font-weight="bold"',
      italic: 'fo:font-style="italic"',
      underline: 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
      strike: 'style:text-line-through-style="solid"',
      code: 'style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\'"',
    }
    const spans = [...this.spans].map(([key, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${key.split('+').map((m) => props[m]).join(' ')}/></style:style>`)
    return `<office:automatic-styles>${spans.join('')}${listStyle('Bullets', false)}${listStyle('Numbers', true)}</office:automatic-styles>`
  }
}

/** A LibreOffice Writer document from the page editor's content. */
export async function writeOdt(doc: PMNode): Promise<Uint8Array> {
  const w = new Writer()
  const body = await w.blocks(doc.content)
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">
${w.automaticStyles()}
<office:body><office:text>${body || '<text:p text:style-name="Standard"/>'}</office:text></office:body>
</office:document-content>`
  const zip = new JSZip()
  // The mimetype comes first and uncompressed, as the format requires.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', content)
  zip.file('styles.xml', STYLES)
  zip.file(
    'META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text" manifest:version="1.3"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
${w.pictures.map((p) => `<manifest:file-entry manifest:full-path="${p.path}" manifest:media-type="${p.mime}"/>`).join('\n')}
</manifest:manifest>`,
  )
  for (const p of w.pictures) zip.file(p.path, p.bytes)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
