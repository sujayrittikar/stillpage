import { useState } from 'react'

export function ImageViewer({ url, title }: { url: string; title: string }) {
  const [actual, setActual] = useState(false)
  return (
    <div className={`image-view ${actual ? 'actual' : ''}`}>
      <img src={url} alt={title} onClick={() => setActual((a) => !a)} title={actual ? 'Fit to pane' : 'Actual size'} />
    </div>
  )
}
