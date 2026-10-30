import { useMemo, useState } from 'react'
import type { Item } from '../lib/types'
import type { Vault } from '../lib/vault'
import { Icon } from './Icon'

interface Candidate {
  key: string
  name: string
  where: string
  kind: 'note' | 'doc'
  open: () => void
}

/** How well `query` matches `text`: its letters in order, rewarding runs and
 *  the starts of words. Null when it doesn't match at all. */
function score(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  const at = t.indexOf(q)
  if (at >= 0) return 1000 - at * 2 - t.length * 0.1 + (at === 0 || /[\s/_-]/.test(t[at - 1]) ? 200 : 0)
  let total = 0
  let from = 0
  let run = 0
  for (const ch of q) {
    const i = t.indexOf(ch, from)
    if (i < 0) return null
    run = i === from ? run + 1 : 0
    total += 10 + run * 6 + (i === 0 || /[\s/_-]/.test(t[i - 1]) ? 12 : 0) - (i - from) * 0.5
    from = i + 1
  }
  return total - t.length * 0.1
}

interface Props {
  items: Record<string, Item>
  vault: Vault | null
  onOpenItem: (id: string) => void
  onOpenPath: (file: string) => void
  onClose: () => void
}

/** Ctrl P: type a few letters of any note, document or file in the folder. */
export function QuickOpen({ items, vault, onOpenItem, onOpenPath, onClose }: Props) {
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)

  const candidates = useMemo<Candidate[]>(() => {
    const inVault = new Set(vault?.files.map((f) => f.path))
    const fromLibrary = Object.values(items)
      .filter((i) => !(i.path && inVault.has(i.path)))
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .map<Candidate>((i) => ({ key: i.id, name: i.title, where: i.kind === 'note' ? 'Note' : 'Library', kind: i.kind, open: () => onOpenItem(i.id) }))
    const fromVault = (vault?.files ?? []).map<Candidate>((f) => ({
      key: f.path,
      name: f.name.replace(/\.(md|markdown)$/i, ''),
      where: f.dir || vault!.name,
      kind: /\.(md|markdown)$/i.test(f.name) ? 'note' : 'doc',
      open: () => onOpenPath(f.path),
    }))
    return [...fromLibrary, ...fromVault]
  }, [items, vault, onOpenItem, onOpenPath])

  const results = useMemo(() => {
    if (!q.trim()) return candidates.slice(0, 12)
    return candidates
      .map((c) => ({ c, s: score(q.trim(), `${c.where === 'Note' || c.where === 'Library' ? '' : c.where + '/'}${c.name}`) }))
      .filter((r): r is { c: Candidate; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.c)
  }, [q, candidates])

  const pick = (c: Candidate | undefined) => {
    if (!c) return
    onClose()
    c.open()
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="quick-open" role="dialog" aria-label="Open anything">
        <label className="search">
          <Icon name="search" size={16} />
          <input
            autoFocus
            placeholder={vault ? `Find a note or a file in ${vault.name}` : 'Find a note or document'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setIndex((i) => (i + step + results.length) % Math.max(1, results.length))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                pick(results[index])
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
          />
        </label>
        <ul className="quick-list" role="listbox">
          {results.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === index} className={i === index ? 'on' : ''} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => (e.preventDefault(), pick(c))}>
              <Icon name={c.kind === 'note' ? 'note' : 'page'} size={14} />
              <span className="quick-name">{c.name}</span>
              <span className="quick-where">{c.where}</span>
            </li>
          ))}
          {!results.length && <li className="quick-empty">Nothing by that name.</li>}
        </ul>
      </div>
    </>
  )
}
