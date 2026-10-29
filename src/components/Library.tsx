import { useMemo, useState } from 'react'
import { FORMAT_LABEL } from '../lib/formats'
import type { Item } from '../lib/types'
import { Icon } from './Icon'

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  items: Record<string, Item>
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  onClose: () => void
  onOpenFile: () => void
  onNewNote: () => void
}

export function Library({ items, onOpen, onRemove, onClose, onOpenFile, onNewNote }: Props) {
  const [q, setQ] = useState('')
  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return Object.values(items)
      .filter((i) => !needle || i.title.toLowerCase().includes(needle))
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  }, [items, q])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="library" aria-label="Library">
        <div className="library-head">
          <h2>Library</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close library">
            <Icon name="close" size={16} />
          </button>
        </div>
        <label className="search">
          <Icon name="search" size={16} />
          <input autoFocus placeholder="Find a note or document" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="library-actions">
          <button className="btn small" onClick={onOpenFile}>
            <Icon name="open" size={15} /> Open a file
          </button>
          <button className="btn small quiet" onClick={onNewNote}>
            <Icon name="note" size={15} /> New note
          </button>
        </div>
        <div className="library-list">
          {(['note', 'doc'] as const).map((kind) => {
            const list = sorted.filter((i) => i.kind === kind)
            if (!list.length) return null
            return (
              <section key={kind}>
                <h3>{kind === 'note' ? 'Notes' : 'Documents'}</h3>
                {list.map((item) => (
                  <div key={item.id} className="lib-row">
                    <button className="lib-open" onClick={() => onOpen(item.id)}>
                      <span className="lib-title">{item.title}</span>
                      <span className="lib-meta">
                        {item.format ? FORMAT_LABEL[item.format] : 'note'}, {ago(item.kind === 'note' ? item.updatedAt : item.lastOpenedAt)}
                      </span>
                    </button>
                    <button
                      className="icon-btn lib-remove"
                      title={item.kind === 'note' ? 'Delete note' : 'Remove from library'}
                      onClick={() => {
                        const verb = item.kind === 'note' ? 'Delete the note' : 'Remove'
                        if (confirm(`${verb} “${item.title}”?${item.kind === 'note' ? ' This cannot be undone.' : ' The file on disk is not touched.'}`)) onRemove(item.id)
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </section>
            )
          })}
          {sorted.length === 0 && <p className="lib-empty">{q ? 'Nothing matches that.' : 'Files you open and notes you write appear here.'}</p>}
        </div>
      </aside>
    </>
  )
}
