// What the page editor hands over (ProseMirror's JSON), and helpers shared by
// the .docx and .odt writers.

export interface PMMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: PMMark[]
}

export interface Picture {
  bytes: Uint8Array
  /** png, jpg, gif or bmp, as both formats name them. */
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  mime: string
  /** Size on the page, in CSS pixels (96 per inch). */
  width: number
  height: number
}

/** Widest an image may be on an A4/Letter page with normal margins. */
const PAGE_WIDTH_PX = 600

/** Decodes an image from the editor (a data: or blob: URL). */
export async function picture(src: string): Promise<Picture | null> {
  try {
    const blob = await (await fetch(src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, PAGE_WIDTH_PX / bitmap.width)
    const size = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) }
    bitmap.close()
    const kind = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg'
    return { bytes, type: kind, mime: blob.type || 'image/jpeg', ...size }
  } catch {
    return null
  }
}

export const hasMark = (node: PMNode, type: string) => node.marks?.some((m) => m.type === type) ?? false
export const linkOf = (node: PMNode) => node.marks?.find((m) => m.type === 'link')?.attrs?.href as string | undefined

/** Plain text of a node, for code blocks and formulas. */
export function textOf(node: PMNode): string {
  if (node.text) return node.text
  if (node.type === 'inlineMath' || node.type === 'blockMath') return String(node.attrs?.latex ?? '')
  return (node.content ?? []).map(textOf).join('')
}
