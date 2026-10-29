import { clean } from '../sanitize'
import { blocks, footnotes, openOdf, type Writer } from './odf'

/** LibreOffice Writer documents (.odt, .ott, flat .fodt). */
export async function renderOdt(buf: ArrayBuffer): Promise<string> {
  const pkg = await openOdf(buf, 'text')
  if (!pkg) throw new Error('This document has no readable text.')
  const w: Writer = { pkg, notes: [] }
  return clean((await blocks(w, pkg.body)) + footnotes(w))
}
