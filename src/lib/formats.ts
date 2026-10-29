import type { Format } from './types'

const BY_EXT: Record<string, Format> = {
  md: 'md', markdown: 'md', mdx: 'md', mdown: 'md',
  pdf: 'pdf',
  docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx',
  pptx: 'pptx', pptm: 'pptx', ppsx: 'pptx', ppsm: 'pptx', potx: 'pptx', potm: 'pptx',
  xlsx: 'sheet', xlsm: 'sheet', xlsb: 'sheet', xltx: 'sheet', xls: 'sheet', csv: 'sheet', tsv: 'sheet', numbers: 'sheet',
  ods: 'sheet', ots: 'sheet', fods: 'sheet',
  epub: 'epub',
  html: 'html', htm: 'html', xhtml: 'html',
  txt: 'txt', text: 'txt', log: 'txt', org: 'txt', rst: 'txt', adoc: 'txt',
  odt: 'odt', ott: 'odt', fodt: 'odt',
  odp: 'odp', otp: 'odp', fodp: 'odp',
  // Only LibreOffice can draw these, so they open as the author's pages.
  doc: 'office', dot: 'office', wps: 'office', wpd: 'office', sxw: 'office', abw: 'office', lwp: 'office', hwp: 'office',
  ppt: 'office', pps: 'office', pot: 'office', sxi: 'office', key: 'office',
  odg: 'office', otg: 'office', fodg: 'office', vsd: 'office', vsdx: 'office', pub: 'office', cdr: 'office',
  pages: 'office',
  rtf: 'rtf',
  ipynb: 'ipynb',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image',
}

/** Extensions shown as syntax-highlighted source. Value is the highlight.js language. */
export const CODE_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  php: 'php', lua: 'lua', r: 'r', pl: 'perl', scala: 'scala', dart: 'dart',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  sql: 'sql', json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  xml: 'xml', vue: 'xml', svelte: 'xml', css: 'css', scss: 'scss', less: 'less',
  tex: 'latex', bib: 'latex', m: 'matlab', jl: 'julia', hs: 'haskell', ex: 'elixir', exs: 'elixir',
  dockerfile: 'dockerfile', makefile: 'makefile', graphql: 'graphql', proto: 'protobuf', diff: 'diff', patch: 'diff',
}

export function extOf(name: string): string {
  const base = name.toLowerCase().split('/').pop() ?? ''
  if (base === 'dockerfile' || base === 'makefile') return base
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1) : ''
}

export function detectFormat(name: string): Format | null {
  const ext = extOf(name)
  if (BY_EXT[ext]) return BY_EXT[ext]
  if (CODE_LANG[ext]) return 'code'
  return null
}

export const ACCEPT = [...Object.keys(BY_EXT), ...Object.keys(CODE_LANG)]
  .filter((e) => e !== 'dockerfile' && e !== 'makefile')
  .map((e) => '.' + e)
  .join(',')

/** Formats with a layout of their own, where "Original" is worth offering. */
export const HAS_ORIGINAL = new Set(['docx', 'odt', 'rtf', 'pptx', 'odp'])

/** What a file is, in words a person would use. */
export function kindName(ext: string): string {
  if (['doc', 'dot', 'docx', 'docm', 'dotx', 'dotm'].includes(ext)) return 'Word document'
  if (['ppt', 'pps', 'pot', 'pptx', 'pptm', 'ppsx'].includes(ext)) return 'PowerPoint presentation'
  if (['odt', 'ott', 'fodt', 'sxw'].includes(ext)) return 'LibreOffice document'
  if (['odp', 'otp', 'fodp', 'sxi'].includes(ext)) return 'LibreOffice presentation'
  if (['odg', 'otg', 'fodg'].includes(ext)) return 'LibreOffice drawing'
  if (ext === 'vsd' || ext === 'vsdx') return 'Visio diagram'
  if (ext === 'pub') return 'Publisher document'
  if (ext === 'pages') return 'Pages document'
  if (ext === 'key') return 'Keynote presentation'
  if (ext === 'wpd') return 'WordPerfect document'
  if (ext === 'wps') return 'Works document'
  if (ext === 'rtf') return 'Rich Text document'
  return `.${ext} file`
}

export const FORMAT_LABEL: Record<Format, string> = {
  md: 'markdown', pdf: 'pdf', docx: 'word', pptx: 'slides', sheet: 'sheet', epub: 'epub',
  html: 'web page', txt: 'text', code: 'code', image: 'image', odt: 'document', odp: 'slides', office: 'document',
  rtf: 'rtf', ipynb: 'notebook',
}
