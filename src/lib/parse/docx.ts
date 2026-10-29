import mammoth from 'mammoth'
import { clean } from '../sanitize'

export async function renderDocx(buf: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buf })
  return clean(result.value)
}
