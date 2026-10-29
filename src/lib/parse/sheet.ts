import * as XLSX from 'xlsx'
import type { Sheet } from '../types'

export function renderSheet(input: ArrayBuffer | string): Sheet[] {
  const wb = typeof input === 'string'
    ? XLSX.read(input, { type: 'string', cellDates: true })
    : XLSX.read(input, { type: 'array', cellDates: true })
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }),
  }))
}
