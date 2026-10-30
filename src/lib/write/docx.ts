import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'
import { hasMark, linkOf, picture, textOf, type PMNode } from './shared'

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
const MONO = 'Courier New'

// Each numbered list restarts at 1, so each gets its own numbering instance.
let listInstance = 0

async function runs(nodes: PMNode[] = []): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }))
    } else if (n.type === 'image') {
      const pic = await picture(String(n.attrs?.src ?? ''))
      if (pic) out.push(new ImageRun({ type: pic.type, data: pic.bytes, transformation: { width: pic.width, height: pic.height }, altText: { name: String(n.attrs?.alt ?? ''), description: String(n.attrs?.alt ?? ''), title: '' } }))
    } else if (n.type === 'inlineMath') {
      out.push(new TextRun({ text: textOf(n), font: MONO }))
    } else if (n.text !== undefined) {
      const run = new TextRun({
        text: n.text,
        bold: hasMark(n, 'bold'),
        italics: hasMark(n, 'italic'),
        underline: hasMark(n, 'underline') ? {} : undefined,
        strike: hasMark(n, 'strike'),
        font: hasMark(n, 'code') ? MONO : undefined,
        style: linkOf(n) ? 'Hyperlink' : undefined,
      })
      const href = linkOf(n)
      out.push(href ? new ExternalHyperlink({ link: href, children: [run] }) : run)
    }
  }
  return out
}

type Block = Paragraph | Table

async function blocks(nodes: PMNode[] = [], ctx: { level?: number; list?: { ref: string; instance: number }; quote?: boolean } = {}): Promise<Block[]> {
  const out: Block[] = []
  for (const n of nodes) {
    const indent = ctx.quote ? { left: 720 } : undefined
    switch (n.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: await runs(n.content),
            indent,
            numbering: ctx.list ? { reference: ctx.list.ref, level: ctx.level ?? 0, instance: ctx.list.instance } : undefined,
          }),
        )
        // Only an item's first paragraph carries the bullet.
        ctx = { ...ctx, list: undefined }
        break
      case 'heading':
        out.push(new Paragraph({ heading: HEADINGS[Math.min(5, Number(n.attrs?.level ?? 1) - 1)], children: await runs(n.content) }))
        break
      case 'bulletList':
      case 'orderedList': {
        const list = { ref: n.type === 'bulletList' ? 'bullets' : 'numbers', instance: ++listInstance }
        const level = ctx.list || ctx.level !== undefined ? (ctx.level ?? -1) + 1 : 0
        for (const item of n.content ?? []) out.push(...(await blocks(item.content, { level, list, quote: ctx.quote })))
        break
      }
      case 'taskList':
        for (const item of n.content ?? []) {
          const [first, ...rest] = item.content ?? []
          out.push(new Paragraph({ indent, children: [new TextRun(item.attrs?.checked ? '☑ ' : '☐ '), ...(await runs(first?.content))] }))
          out.push(...(await blocks(rest, ctx)))
        }
        break
      case 'blockquote':
        out.push(...(await blocks(n.content, { ...ctx, quote: true })))
        break
      case 'codeBlock':
        for (const line of textOf(n).split('\n')) out.push(new Paragraph({ indent, children: [new TextRun({ text: line, font: MONO, size: 20 })] }))
        break
      case 'blockMath':
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: textOf(n), font: MONO })] }))
        break
      case 'horizontalRule':
        out.push(new Paragraph({ thematicBreak: true, children: [] }))
        break
      case 'image':
        out.push(new Paragraph({ children: await runs([n]) }))
        break
      case 'table': {
        const rows = await Promise.all(
          (n.content ?? []).map(
            async (row) =>
              new TableRow({
                tableHeader: row.content?.every((c) => c.type === 'tableHeader'),
                children: await Promise.all(
                  (row.content ?? []).map(async (cell) => {
                    const inner = await blocks(cell.content)
                    return new TableCell({ children: inner.length ? inner : [new Paragraph('')] })
                  }),
                ),
              }),
          ),
        )
        if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
        break
      }
      default:
        if (n.content) out.push(...(await blocks(n.content, ctx)))
    }
  }
  return out
}

const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (i: number) => string) =>
  Array.from({ length: 6 }, (_, i) => ({ level: i, format, text: text(i), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } }))

/** A Word document from the page editor's content. */
export async function writeDocx(doc: PMNode): Promise<Uint8Array> {
  listInstance = 0
  const document = new Document({
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(LevelFormat.BULLET, (i) => ['•', '◦', '▪'][i % 3]) },
        { reference: 'numbers', levels: levels(LevelFormat.DECIMAL, (i) => `%${i + 1}.`) },
      ],
    },
    sections: [{ children: await blocks(doc.content) }],
  })
  return new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer())
}
