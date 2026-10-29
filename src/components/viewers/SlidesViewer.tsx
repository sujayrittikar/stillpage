import type { Slide } from '../../lib/types'

export function SlidesViewer({ slides }: { slides: Slide[] }) {
  if (!slides.length) return <p className="viewer-empty">This presentation has no slides.</p>
  return (
    <div className="slides">
      {slides.map((s) => (
        <section key={s.index} className="slide" data-where={`slide ${s.index}`}>
          <span className="slide-num">{s.index}</span>
          {s.title && <h2>{s.title}</h2>}
          <div className="slide-body">
            {s.blocks.map((b, i) => {
              if (b.kind === 'img') return <img key={i} src={b.src} alt="" />
              if (b.kind === 'table')
                return (
                  <table key={i}>
                    <tbody>
                      {b.rows.map((r, ri) => (
                        <tr key={ri}>{r.map((c, ci) => (ri === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}</tr>
                      ))}
                    </tbody>
                  </table>
                )
              return (
                <p key={i} className={b.bullet ? 'bullet' : ''} style={{ marginInlineStart: `${b.level * 1.4}em` }}>
                  {b.text}
                </p>
              )
            })}
          </div>
          {s.notes && (
            <details className="slide-notes">
              <summary>Speaker notes</summary>
              <p>{s.notes}</p>
            </details>
          )}
        </section>
      ))}
    </div>
  )
}
