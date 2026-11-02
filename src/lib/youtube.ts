// YouTube videos in a pane: reading links, timestamps, and the players that
// are open right now. The player is YouTube's own embed, driven through its
// postMessage protocol, so no YouTube script runs in the app itself.

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

export interface VideoRef {
  id: string
  list?: string
  /** Seconds into the video, from a `t=` or `start=` in the link. */
  start?: number
}

const ID = /^[\w-]{11}$/

/** Seconds from `754`, `754s`, `12m34s` or `1h2m3s`. */
function seconds(t: string | null): number | undefined {
  if (!t) return undefined
  if (/^\d+s?$/.test(t)) return parseInt(t, 10)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** The video a YouTube link points at, or null for anything else. */
export function parseYouTube(text: string): VideoRef | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ?? null
  }
  if (!id || !ID.test(id)) return null
  const list = url.searchParams.get('list') ?? undefined
  const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'))
  return { id, ...(list && { list }), ...(start !== undefined && { start }) }
}

/** 754 → "12:34", 3723 → "1:02:03". */
export function clock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`
}

/** A link that opens the video at that moment, here or on YouTube. */
export function timestampUrl(id: string, at: number): string {
  return `https://youtu.be/${id}?t=${Math.floor(at)}`
}

export function embedUrl(ref: VideoRef): string {
  const params = new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1', origin: location.origin })
  if (ref.start) params.set('start', String(Math.floor(ref.start)))
  if (ref.list) params.set('list', ref.list)
  return `${EMBED_ORIGIN}/embed/${ref.id}?${params}`
}

/** The video's title, from YouTube's oEmbed endpoint. */
export async function fetchTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { title?: string }
    return body.title?.trim() || null
  } catch {
    return null
  }
}

// ---- Open players ----------------------------------------------------------

export interface Player {
  itemId: string
  videoId: string
  time(): number
  playing(): boolean
  command(func: 'playVideo' | 'pauseVideo' | 'seekTo', args?: unknown[]): void
}

const players = new Map<string, Player>()
/** Item ids of visible players, most recently shown last. */
let shown: string[] = []

export function registerPlayer(p: Player) {
  players.set(p.itemId, p)
  return () => {
    players.delete(p.itemId)
    shown = shown.filter((id) => id !== p.itemId)
  }
}

export function setPlayerShown(itemId: string, on: boolean) {
  shown = shown.filter((id) => id !== itemId)
  if (on) shown.push(itemId)
}

/** The video you are most likely taking notes on: the last one shown. */
export function currentPlayer(): Player | null {
  for (let i = shown.length - 1; i >= 0; i--) {
    const p = players.get(shown[i])
    if (p) return p
  }
  return null
}

export function playerFor(itemId: string): Player | null {
  return players.get(itemId) ?? null
}
