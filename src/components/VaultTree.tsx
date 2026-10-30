import { useMemo, useState } from 'react'
import { detectFormat } from '../lib/formats'
import { renameVaultFile, trashVaultFile, type Vault, type VaultFile } from '../lib/vault'
import { Icon } from './Icon'

const CLOSED_KEY = 'stillpage.vault.closed'

function readClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

interface Folder {
  name: string
  rel: string
  folders: Folder[]
  files: VaultFile[]
}

function buildTree(files: VaultFile[]): Folder {
  const root: Folder = { name: '', rel: '', folders: [], files: [] }
  for (const file of files) {
    let node = root
    if (file.dir) {
      for (const part of file.dir.split('/')) {
        const rel = node.rel ? `${node.rel}/${part}` : part
        let next = node.folders.find((f) => f.rel === rel)
        if (!next) {
          next = { name: part, rel, folders: [], files: [] }
          node.folders.push(next)
        }
        node = next
      }
    }
    node.files.push(file)
  }
  return root
}

const shown = (name: string) => (/\.(md|markdown)$/i.test(name) ? name.replace(/\.[^.]+$/, '') : name)

interface Props {
  vault: Vault
  query: string
  /** Paths already open somewhere, to mark them. */
  open: Set<string>
  onOpen: (file: string) => void
}

/** The folder as a tree: folders fold, files open on click, the pencil (or
 *  F2) renames, and the bin moves a file to the trash. */
export function VaultTree({ vault, query, open, onOpen }: Props) {
  const [closed, setClosed] = useState(readClosed)
  const [renaming, setRenaming] = useState<string | null>(null)
  const tree = useMemo(() => buildTree(vault.files), [vault.files])

  const toggle = (rel: string) =>
    setClosed((c) => {
      const next = new Set(c)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]))
      } catch {
        /* folded for now, not remembered */
      }
      return next
    })

  const row = (file: VaultFile, depth: number, showDir = false) => {
    const format = detectFormat(file.name)
    return (
      <div key={file.path} className={`lib-row vault-file ${open.has(file.path) ? 'is-open' : ''}`} style={{ paddingLeft: depth * 14 }}>
        {renaming === file.path ? (
          <input
            className="vault-rename"
            defaultValue={shown(file.name)}
            aria-label="New name"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.currentTarget.value = shown(file.name)
                e.currentTarget.blur()
              }
            }}
            onBlur={(e) => {
              const name = e.currentTarget.value.trim()
              setRenaming(null)
              if (name && name !== shown(file.name)) void renameVaultFile(file.path, name)
            }}
          />
        ) : (
          <button className="lib-open" onClick={() => onOpen(file.path)} onKeyDown={(e) => e.key === 'F2' && setRenaming(file.path)} title={file.rel}>
            <span className="lib-title">
              <Icon name={format === 'md' ? 'note' : 'page'} size={14} />
              {shown(file.name)}
            </span>
            {showDir && file.dir && <span className="lib-meta">{file.dir}</span>}
          </button>
        )}
        <button className="icon-btn lib-remove" title="Rename (F2)" onClick={() => setRenaming(file.path)}>
          <Icon name="note" size={14} />
        </button>
        <button
          className="icon-btn lib-remove"
          title="Move to the trash"
          onClick={() => {
            if (confirm(`Move “${file.name}” to the trash?`)) void trashVaultFile(file.path)
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  if (needle) {
    const hits = vault.files.filter((f) => f.rel.toLowerCase().includes(needle))
    if (!hits.length) return <p className="lib-empty">Nothing in {vault.name} matches that.</p>
    return <>{hits.slice(0, 200).map((f) => row(f, 0, true))}</>
  }

  const folder = (node: Folder, depth: number) => (
    <>
      {node.folders.map((f) => (
        <div key={f.rel} className="vault-folder">
          <button className="vault-folder-name" style={{ paddingLeft: 12 + depth * 14 }} onClick={() => toggle(f.rel)} aria-expanded={!closed.has(f.rel)}>
            <span className="vault-caret" aria-hidden="true" />
            {f.name}
          </button>
          {!closed.has(f.rel) && folder(f, depth + 1)}
        </div>
      ))}
      {node.files.map((f) => row(f, depth))}
    </>
  )

  if (!vault.files.length) return <p className="lib-empty">Nothing here Stillpage can open yet. Notes you make go in this folder.</p>
  return (
    <>
      {folder(tree, 0)}
      {vault.truncated && <p className="lib-empty">This folder is very large; only the first 20,000 files are listed.</p>}
    </>
  )
}
