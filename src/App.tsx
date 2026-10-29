import { useCallback, useEffect, useRef, useState } from 'react'
import { Enso, Icon } from './components/Icon'
import { FocusTimer } from './components/FocusTimer'
import { Library } from './components/Library'
import { PaneView } from './components/PaneView'
import { SelectionCapture, type Capture } from './components/SelectionCapture'
import { Settings } from './components/Settings'
import { SpotifyDock } from './components/SpotifyDock'
import { uid } from './lib/db'
import { ACCEPT } from './lib/formats'
import { appendToNote, createNote, getItem, importFiles, removeItem, touchItem, useItems } from './lib/library'
import { loadLayout, saveLayout, usePrefs } from './lib/prefs'
import type { DesktopFile, Layout, Pane } from './lib/types'

const MAX_PANES = 4
const MIN_FRACTION = 0.14

const freshLayout = (): Layout => ({ panes: [{ id: 'p1', tabs: [], active: null, size: 1 }], focused: 'p1' })

function normalise(panes: Pane[]): Pane[] {
  const total = panes.reduce((s, p) => s + p.size, 0) || 1
  return panes.map((p) => ({ ...p, size: p.size / total }))
}

function addTabs(l: Layout, paneId: string, ids: string[]): Layout {
  return {
    focused: paneId,
    panes: l.panes.map((p) =>
      p.id !== paneId ? p : { ...p, tabs: [...p.tabs, ...ids.filter((i) => !p.tabs.includes(i))], active: ids.at(-1) ?? p.active },
    ),
  }
}

function withoutTab(p: Pane, id: string): Pane {
  const i = p.tabs.indexOf(id)
  if (i < 0) return p
  const tabs = p.tabs.filter((t) => t !== id)
  return { ...p, tabs, active: p.active === id ? (tabs[i] ?? tabs[i - 1] ?? null) : p.active }
}

interface Toast {
  id: string
  text: string
}

export default function App() {
  const items = useItems()
  const [prefs, setPrefs] = usePrefs()
  const [layout, setLayout] = useState<Layout>(() => loadLayout(freshLayout()))
  const [zen, setZen] = useState(false)
  const [ensoMoment, setEnsoMoment] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [screens, setScreens] = useState({ count: 1, spanned: false })
  const [toasts, setToasts] = useState<Toast[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const lastNote = useRef<string | null>(localStorage.getItem('stillpage.lastNote'))
  const openTarget = useRef<string | null>(null)

  useEffect(() => saveLayout(layout), [layout])

  // Remember the note you were last writing in; quotes go there.
  useEffect(() => {
    const focused = layout.panes.find((p) => p.id === layout.focused)
    const candidates = [focused, ...layout.panes].map((p) => p?.active).filter(Boolean) as string[]
    const note = candidates.find((id) => getItem(id)?.kind === 'note')
    if (note && note !== lastNote.current) {
      lastNote.current = note
      localStorage.setItem('stillpage.lastNote', note)
    }
  }, [layout, items])

  const toast = useCallback((text: string) => {
    const id = uid()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
  }, [])

  const openItems = useCallback((ids: string[], paneId?: string) => {
    if (!ids.length) return
    ids.forEach(touchItem)
    setLayout((l) => {
      if (ids.length === 1 && !paneId) {
        const holder = l.panes.find((p) => p.tabs.includes(ids[0]))
        if (holder) return { focused: holder.id, panes: l.panes.map((p) => (p === holder ? { ...p, active: ids[0] } : p)) }
      }
      const target = paneId && l.panes.some((p) => p.id === paneId) ? paneId : l.focused
      return addTabs(l, target, ids)
    })
  }, [])

  /** Opens an item next to whatever document you are reading. */
  const openBeside = useCallback((id: string) => {
    touchItem(id)
    setLayout((l) => {
      if (l.panes.some((p) => p.tabs.includes(id))) {
        return { ...l, panes: l.panes.map((p) => (p.tabs.includes(id) ? { ...p, active: id } : p)) }
      }
      const fi = Math.max(0, l.panes.findIndex((p) => p.id === l.focused))
      const focused = l.panes[fi]
      const readingDoc = focused.active && getItem(focused.active)?.kind === 'doc'
      if (!readingDoc) return addTabs(l, focused.id, [id])
      if (l.panes.length === 1) {
        const pane: Pane = { id: uid(), tabs: [id], active: id, size: 0.42 }
        return { focused: pane.id, panes: normalise([{ ...focused, size: 0.58 }, pane]) }
      }
      const neighbour = l.panes[fi + 1] ?? l.panes[fi - 1]
      return addTabs(l, neighbour.id, [id])
    })
  }, [])

  const handleFiles = useCallback(
    async (files: File[], paneId?: string) => {
      if (!files.length) return
      const { ids, rejected } = await importFiles(files)
      rejected.forEach(toast)
      openItems(ids, paneId)
    },
    [openItems, toast],
  )

  // Files passed by the desktop shell ("Open with Stillpage", command line).
  useEffect(() => {
    const bridge = window.stillpage
    if (!bridge) return
    const take = (list: DesktopFile[]) => handleFiles(list.map((f) => new File([f.data as BlobPart], f.name, { lastModified: f.lastModified })))
    void bridge.takePendingFiles().then(take)
    return bridge.onOpenFiles(take)
  }, [handleFiles])

  // Spanning monitors. GNOME's maximize stops at one screen, so the main
  // process stretches the window over all of them instead.
  useEffect(() => {
    const bridge = window.stillpage
    if (!bridge?.screenInfo) return
    const refresh = () => void bridge.screenInfo().then(setScreens)
    refresh()
    window.addEventListener('focus', refresh)
    const off = bridge.onSpanChanged((spanned) => setScreens((s) => ({ ...s, spanned })))
    return () => {
      window.removeEventListener('focus', refresh)
      off()
    }
  }, [])

  const toggleSpan = useCallback(async () => {
    const bridge = window.stillpage
    if (!bridge?.spanScreens) return
    const { spanned, seams } = await bridge.spanScreens(!screens.spanned)
    setScreens((s) => ({ ...s, spanned }))
    if (!spanned || seams.length !== 1) return
    // Put the pane divider on the bezel: one document per screen.
    const [seam] = seams
    setLayout((l) => {
      if (l.panes.length > 2) return l
      const second = l.panes[1] ?? { id: uid(), tabs: [], active: null, size: 0 }
      return { ...l, panes: [{ ...l.panes[0], size: seam }, { ...second, size: 1 - seam }] }
    })
  }, [screens.spanned])

  const pickFiles = (paneId?: string) => {
    openTarget.current = paneId ?? null
    fileInput.current?.click()
  }

  const newNote = useCallback(() => openBeside(createNote()), [openBeside])

  const split = useCallback(() => {
    setLayout((l) => {
      if (l.panes.length >= MAX_PANES) return l
      const fi = Math.max(0, l.panes.findIndex((p) => p.id === l.focused))
      const pane: Pane = { id: uid(), tabs: [], active: null, size: 1 / (l.panes.length + 1) }
      const panes = [...l.panes]
      panes.splice(fi + 1, 0, pane)
      return { focused: pane.id, panes: normalise(panes.map((p) => (p === pane ? p : { ...p, size: (p.size * l.panes.length) / (l.panes.length + 1) }))) }
    })
  }, [])

  const closePane = (id: string) =>
    setLayout((l) => {
      if (l.panes.length === 1) return l
      const i = l.panes.findIndex((p) => p.id === id)
      const gone = l.panes[i]
      const heirIndex = i > 0 ? i - 1 : 1
      const heir = l.panes[heirIndex]
      const panes = l.panes
        .map((p, j) => (j === heirIndex ? { ...p, size: p.size + gone.size, tabs: [...p.tabs, ...gone.tabs.filter((t) => !p.tabs.includes(t))], active: p.active ?? gone.active } : p))
        .filter((p) => p.id !== id)
      return { focused: heir.id, panes: normalise(panes) }
    })

  const closeTab = (paneId: string, id: string) => setLayout((l) => ({ ...l, panes: l.panes.map((p) => (p.id === paneId ? withoutTab(p, id) : p)) }))

  const moveTab = (id: string, from: string, to: string) =>
    setLayout((l) => {
      if (from === to) return { ...l, focused: to, panes: l.panes.map((p) => (p.id === to ? { ...p, active: id } : p)) }
      const moved = { ...l, panes: l.panes.map((p) => (p.id === from ? withoutTab(p, id) : p)) }
      return addTabs(moved, to, [id])
    })

  const resize = (index: number, dx: number) => {
    const width = workspace.current?.clientWidth ?? 1
    setLayout((l) => {
      const panes = [...l.panes]
      const a = panes[index]
      const b = panes[index + 1]
      const delta = Math.max(MIN_FRACTION - a.size, Math.min(b.size - MIN_FRACTION, dx / width))
      panes[index] = { ...a, size: a.size + delta }
      panes[index + 1] = { ...b, size: b.size - delta }
      return { ...l, panes }
    })
  }

  const toggleZen = useCallback(() => {
    setZen((z) => {
      if (!z && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setEnsoMoment(true)
        setTimeout(() => setEnsoMoment(false), 2000)
      }
      return !z
    })
  }, [])

  const capture = useCallback(
    async (c: Capture) => {
      let target = lastNote.current && getItem(lastNote.current) ? lastNote.current : null
      if (!target) target = createNote(`# Notes on ${c.source}\n\n`)
      // PDFs break selections at every visual line; rejoin them into prose.
      const quoted = c.text
        .replace(/-\n(?=[a-z])/g, '')
        .split(/\n\s*\n/)
        .map((para) => `> ${para.replace(/\s*\n\s*/g, ' ').trim()}`)
        .join('\n>\n')
      await appendToNote(target, `${quoted}\n>\n> — ${c.source}${c.where ? `, ${c.where}` : ''}\n\n`)
      lastNote.current = target
      const visible = layout.panes.some((p) => p.active === target)
      if (!visible) openBeside(target)
      toast(`Added to “${getItem(target)?.title ?? 'note'}”`)
    },
    [layout, openBeside, toast],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'o') {
        e.preventDefault()
        pickFiles()
      } else if (e.altKey && key === 'n') {
        e.preventDefault()
        newNote()
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        split()
      } else if (mod && e.key === '.') {
        e.preventDefault()
        toggleZen()
      } else if (mod && e.shiftKey && key === 's') {
        e.preventDefault()
        void toggleSpan()
      } else if (e.key === 'F11') {
        e.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      } else if (e.altKey && key === 'w') {
        e.preventDefault()
        const pane = layout.panes.find((p) => p.id === layout.focused)
        if (pane?.active) closeTab(pane.id, pane.active)
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        setLayout((l) => ({
          ...l,
          panes: l.panes.map((p) => {
            if (p.id !== l.focused || p.tabs.length < 2) return p
            const i = p.tabs.indexOf(p.active ?? '')
            return { ...p, active: p.tabs[(i + (e.shiftKey ? -1 : 1) + p.tabs.length) % p.tabs.length] }
          }),
        }))
      } else if (e.altKey && /^[1-4]$/.test(e.key)) {
        const pane = layout.panes[Number(e.key) - 1]
        if (pane) {
          e.preventDefault()
          setLayout((l) => ({ ...l, focused: pane.id }))
        }
      } else if (e.key === 'Escape') {
        if (settingsOpen || libraryOpen) {
          setSettingsOpen(false)
          setLibraryOpen(false)
        } else if (zen) setZen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout, newNote, split, toggleZen, toggleSpan, zen, settingsOpen, libraryOpen])

  // Stop stray file drops from navigating the window away.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const focusedPane = layout.panes.find((p) => p.id === layout.focused)
  const focusedTitle = focusedPane?.active ? items[focusedPane.active]?.title : null

  return (
    <div className={`app ${zen ? 'zen' : ''}`}>
      <div className="rail-hotzone" />
      <header className="rail">
        <div className="brand">
          <Enso size={22} />
          <span>Stillpage</span>
        </div>
        <nav className="rail-group">
          <button className={`rail-btn ${libraryOpen ? 'on' : ''}`} onClick={() => setLibraryOpen((o) => !o)} title="Library">
            <Icon name="library" />
          </button>
          <button className="rail-btn" onClick={() => pickFiles()} title="Open files (Ctrl O)">
            <Icon name="open" />
          </button>
          <button className="rail-btn" onClick={newNote} title="New note beside (Alt N)">
            <Icon name="note" />
          </button>
          <button className="rail-btn" onClick={split} disabled={layout.panes.length >= MAX_PANES} title="Split (Ctrl \)">
            <Icon name="split" />
          </button>
        </nav>
        <p className="rail-title">{focusedTitle}</p>
        <nav className="rail-group">
          <FocusTimer onDone={(m) => toast(`${m} minutes of focus. Take a breath.`)} />
          <div className="settings-anchor">
            <button className={`rail-btn ${settingsOpen ? 'on' : ''}`} onClick={() => setSettingsOpen((o) => !o)} title="Reading settings">
              <Icon name="type" />
            </button>
            {settingsOpen && <Settings prefs={prefs} set={setPrefs} onClose={() => setSettingsOpen(false)} />}
          </div>
          {(screens.count > 1 || screens.spanned) && (
            <button className={`rail-btn ${screens.spanned ? 'on' : ''}`} onClick={() => void toggleSpan()} title={screens.spanned ? 'Back to one screen (Ctrl Shift S)' : 'Span all screens (Ctrl Shift S)'}>
              <Icon name="screens" />
            </button>
          )}
          <button
            className="rail-btn"
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen())}
            title="Full screen (F11)"
          >
            <Icon name="fullscreen" />
          </button>
          <button className="rail-btn zen-btn" onClick={toggleZen} title="Zen mode (Ctrl .)">
            <Icon name="zen" />
            <span>Zen</span>
          </button>
        </nav>
      </header>

      <main className="workspace" ref={workspace}>
        {layout.panes.map((pane, i) => (
          <div key={pane.id} className="pane-slot" style={{ flexGrow: pane.size, flexBasis: 0 }}>
            <PaneView
              pane={pane}
              items={items}
              prefs={prefs}
              focused={layout.panes.length > 1 && pane.id === layout.focused}
              canClose={layout.panes.length > 1}
              onFocus={() => pane.id !== layout.focused && setLayout((l) => ({ ...l, focused: pane.id }))}
              onActivate={(id) => {
                touchItem(id)
                setLayout((l) => ({ ...l, focused: pane.id, panes: l.panes.map((p) => (p.id === pane.id ? { ...p, active: id } : p)) }))
              }}
              onCloseTab={(id) => closeTab(pane.id, id)}
              onClosePane={() => closePane(pane.id)}
              onDropTab={(id, from) => moveTab(id, from, pane.id)}
              onDropFiles={(files) => handleFiles(files, pane.id)}
              onOpen={() => pickFiles(pane.id)}
              onNewNote={() => {
                const id = createNote()
                openItems([id], pane.id)
              }}
            />
            {i < layout.panes.length - 1 && <Divider onDrag={(dx) => resize(i, dx)} />}
          </div>
        ))}
      </main>

      {libraryOpen && (
        <Library
          items={items}
          onOpen={(id) => {
            openItems([id])
            setLibraryOpen(false)
          }}
          onRemove={(id) => {
            setLayout((l) => ({ ...l, panes: l.panes.map((p) => withoutTab(p, id)) }))
            void removeItem(id)
          }}
          onClose={() => setLibraryOpen(false)}
          onOpenFile={() => {
            setLibraryOpen(false)
            pickFiles()
          }}
          onNewNote={() => {
            setLibraryOpen(false)
            newNote()
          }}
        />
      )}

      <SelectionCapture onCapture={capture} />
      <SpotifyDock zen={zen} />

      {ensoMoment && (
        <div className="enso-moment" aria-hidden="true">
          <Enso size={180} />
        </div>
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []), openTarget.current ?? undefined)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Divider({ onDrag }: { onDrag: (dx: number) => void }) {
  const last = useRef(0)
  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        last.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.classList.add('resizing')
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        onDrag(e.clientX - last.current)
        last.current = e.clientX
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing')
      }}
    />
  )
}
