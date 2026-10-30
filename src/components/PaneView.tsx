import { useRef, useState, type DragEvent } from 'react'
import { usePaneFit } from '../lib/fit'
import { FORMAT_LABEL } from '../lib/formats'
import type { Item, Pane, Prefs } from '../lib/types'
import { DocView } from './DocView'
import { Enso, Icon } from './Icon'
import { NoteEditor } from './NoteEditor'

export const TAB_MIME = 'application/x-stillpage-tab'

interface Props {
  pane: Pane
  items: Record<string, Item>
  focused: boolean
  canClose: boolean
  prefs: Prefs
  onFocus: () => void
  onActivate: (id: string) => void
  onCloseTab: (id: string) => void
  onRename: (id: string, title: string) => void
  onClosePane: () => void
  onDropTab: (id: string, fromPane: string) => void
  onDropFiles: (files: File[]) => void
  onOpen: () => void
  onNewNote: () => void
}

export function PaneView(p: Props) {
  const [dropping, setDropping] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TAB_MIME) || e.dataTransfer.types.includes('Files')
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    setDropping(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const tab = e.dataTransfer.getData(TAB_MIME)
    if (tab) {
      const { id, from } = JSON.parse(tab) as { id: string; from: string }
      p.onDropTab(id, from)
    } else if (e.dataTransfer.files.length) {
      p.onDropFiles(Array.from(e.dataTransfer.files))
    }
  }

  const tabs = p.pane.tabs.filter((id) => p.items[id])
  const body = useRef<HTMLDivElement>(null)
  usePaneFit(body, p.prefs)

  return (
    <section
      className={`pane ${p.focused ? 'focused' : ''} ${dropping ? 'dropping' : ''}`}
      onMouseDownCapture={p.onFocus}
      onFocusCapture={p.onFocus}
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={onDrop}
    >
      <header className="tabbar">
        <div className="tabs" role="tablist">
          {tabs.map((id) => {
            const item = p.items[id]
            return (
              <div
                key={id}
                role="tab"
                tabIndex={0}
                aria-selected={id === p.pane.active}
                className={`tab ${id === p.pane.active ? 'on' : ''} kind-${item.kind}`}
                draggable={renaming !== id}
                title={item.kind === 'note' ? `${item.title}. Double-click to rename.` : item.title}
                onDoubleClick={() => item.kind === 'note' && setRenaming(id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_MIME, JSON.stringify({ id, from: p.pane.id }))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => p.onActivate(id)}
                onKeyDown={(e) => e.key === 'Enter' && p.onActivate(id)}
                onAuxClick={(e) => e.button === 1 && p.onCloseTab(id)}
              >
                {item.kind === 'note' && <Icon name="note" size={13} />}
                {renaming === id ? (
                  <input
                    className="tab-rename"
                    aria-label="Note name"
                    defaultValue={item.draft ? '' : item.title}
                    placeholder="Name this note"
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        e.currentTarget.value = ''
                        e.currentTarget.blur()
                      }
                    }}
                    onBlur={(e) => {
                      p.onRename(id, e.currentTarget.value)
                      setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="tab-title">{item.title}</span>
                )}
                {item.format && <span className="tab-kind">{FORMAT_LABEL[item.format]}</span>}
                <button
                  className="tab-close"
                  aria-label={`Close ${item.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    p.onCloseTab(id)
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )
          })}
        </div>
        {p.canClose && (
          <button className="icon-btn pane-close" title="Close this pane" onClick={p.onClosePane}>
            <Icon name="close" size={14} />
          </button>
        )}
      </header>
      <div className="pane-body" ref={body}>
        {tabs.length === 0 && (
          <div className="empty">
            <Enso size={88} className="empty-enso" />
            <p className="empty-line">Drop a file here, or start with a blank page.</p>
            <div className="empty-actions">
              <button className="btn" onClick={p.onOpen}>
                <Icon name="open" size={16} /> Open a file
              </button>
              <button className="btn quiet" onClick={p.onNewNote}>
                <Icon name="note" size={16} /> New note
              </button>
            </div>
            <p className="empty-formats">PDF, Word, PowerPoint, Excel, CSV, EPUB, Markdown, Jupyter, OpenDocument, RTF, HTML, images and source code.</p>
          </div>
        )}
        {tabs.map((id) => (
          <div key={id} className={`tab-panel ${id === p.pane.active ? '' : 'inactive'}`} inert={id !== p.pane.active}>
            {p.items[id].kind === 'note' ? <NoteEditor id={id} active={id === p.pane.active} /> : <DocView item={p.items[id]} prefs={p.prefs} />}
          </div>
        ))}
      </div>
    </section>
  )
}
