import { useState } from 'react'
import type { Sheet } from '../../lib/types'

const ROW_LIMIT = 3000

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function SheetViewer({ sheets }: { sheets: Sheet[] }) {
  const [index, setIndex] = useState(0)
  const sheet = sheets[index]
  if (!sheet) return <p className="viewer-empty">This workbook is empty.</p>
  const cols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0)
  const rows = sheet.rows.slice(0, ROW_LIMIT)

  return (
    <div className="sheet">
      <div className="sheet-scroll">
        <table>
          <thead>
            <tr>
              <th className="corner" />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}>{colName(i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <th>{ri + 1}</th>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} className={/^-?[\d.,]+%?$/.test(r[ci] ?? '') ? 'num' : ''}>
                    {r[ci]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length > ROW_LIMIT && (
          <p className="sheet-more">Showing the first {ROW_LIMIT.toLocaleString()} of {sheet.rows.length.toLocaleString()} rows.</p>
        )}
      </div>
      {sheets.length > 1 && (
        <div className="sheet-tabs" role="tablist">
          {sheets.map((s, i) => (
            <button key={s.name} role="tab" aria-selected={i === index} className={i === index ? 'on' : ''} onClick={() => setIndex(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
