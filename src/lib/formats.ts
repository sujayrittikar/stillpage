import type { Format } from './types'

const BY_EXT: Record<string, Format> = {
  md: 'md', markdown: 'md', mdx: 'md', mdown: 'md',
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet', numbers: 'sheet',
  epub: 'epub',
  html: 'html', htm: 'html', xhtml: 'html',
  txt: 'txt', text: 'txt', log: 'txt', org: 'txt', rst: 'txt', adoc: 'txt',
  odt: 'odt',
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

export const UNSUPPORTED_HINT: Record<string, string> = {
  doc: 'Old .doc files cannot be read. Save it as .docx and open it again.',
  ppt: 'Old .ppt files cannot be read. Save it as .pptx and open it again.',
  pages: 'Pages files cannot be read. Export as PDF or .docx first.',
  key: 'Keynote files cannot be read. Export as PDF or .pptx first.',
}

export const FORMAT_LABEL: Record<Format, string> = {
  md: 'markdown', pdf: 'pdf', docx: 'word', pptx: 'slides', sheet: 'sheet', epub: 'epub',
  html: 'web page', txt: 'text', code: 'code', image: 'image', odt: 'odt', rtf: 'rtf', ipynb: 'notebook',
}
