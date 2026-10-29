import { renderPlainText } from './text'

/** A small RTF-to-text pass: good enough to read, not to round-trip. */
export function renderRtf(src: string): string {
  let text = src
  // Drop destinations we never want to show (font tables, stylesheets, pictures…).
  for (let i = 0; i < 4; i++) text = text.replace(/\{\\\*[^{}]*\}|\{\\(?:fonttbl|colortbl|stylesheet|info|pict|header|footer)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
  text = text
    .replace(/\\par[d]?\b ?/g, '\n\n')
    .replace(/\\line\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_m, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/\\([{}\\])/g, '$1')
    .replace(/[{}]/g, '')
  return renderPlainText(text.replace(/\n{3,}/g, '\n\n'))
}
