import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getClientId, isConnected, login, logout, REDIRECT_URI, setClientId, SpotifyError, startLocalPlayer, type LocalPlayer } from '../lib/spotify'
import { Icon } from './Icon'

interface Track {
  name: string
  artists: string
  art: string | null
  duration: number
}
interface PlayerState {
  playing: boolean
  track: Track | null
  device: { id: string; name: string; volume: number } | null
  progress: number
  at: number
}
interface Playlist {
  id: string
  name: string
  uri: string
  image: string | null
}
interface Song {
  id: string
  uri: string
  name: string
  artists: string
  image: string | null
}
interface Device {
  id: string
  name: string
  is_active: boolean
}

const EMPTY: PlayerState = { playing: false, track: null, device: null, progress: 0, at: 0 }
const EMBED_KEY = 'stillpage.spotify.embed'

function toEmbed(link: string): string | null {
  const m = link.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|track|artist|show|episode)[/:]([A-Za-z0-9]+)/)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null
}

function openExternal(url: string) {
  if (window.stillpage) void window.stillpage.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

export function SpotifyDock({ zen }: { zen: boolean }) {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(isConnected())
  const [state, setState] = useState<PlayerState>(EMPTY)
  const [localId, setLocalId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [clientId, setClientIdDraft] = useState(getClientId())
  const [embed, setEmbed] = useState<string | null>(() => localStorage.getItem(EMBED_KEY))
  const [embedDraft, setEmbedDraft] = useState('')
  const [webSignedIn, setWebSignedIn] = useState<boolean | null>(null)
  const [embedKey, setEmbedKey] = useState(0)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ q: string; songs: Song[] } | null>(null)
  const [, tick] = useState(0)
  const volumeTimer = useRef<number | undefined>(undefined)

  const web = window.stillpage?.spotifyWeb
  useEffect(() => {
    if (open && web) void web.status().then(setWebSignedIn)
  }, [open, web])

  const signInWeb = async () => {
    if (!web) return
    const ok = await web.login()
    setWebSignedIn(ok)
    if (ok) setEmbedKey((k) => k + 1)
  }

  const signOutWeb = async () => {
    if (!web) return
    setWebSignedIn(await web.logout())
    setEmbedKey((k) => k + 1)
  }

  const fail = useCallback((err: unknown) => {
    if (err instanceof SpotifyError && err.status === 401) {
      logout()
      setConnected(false)
    }
    setMessage(err instanceof Error ? err.message : String(err))
  }, [])

  const refresh = useCallback(async () => {
    try {
      type Raw = { is_playing: boolean; progress_ms: number; item?: { name: string; duration_ms: number; artists?: { name: string }[]; album?: { images?: { url: string }[] }; show?: { name: string; images?: { url: string }[] } }; device?: { id: string; name: string; volume_percent: number } }
      const s = await api<Raw>('/me/player')
      if (!s) return setState(EMPTY)
      setState({
        playing: s.is_playing,
        progress: s.progress_ms ?? 0,
        at: Date.now(),
        device: s.device ? { id: s.device.id, name: s.device.name, volume: s.device.volume_percent } : null,
        track: s.item
          ? {
              name: s.item.name,
              artists: s.item.artists?.map((a) => a.name).join(', ') ?? s.item.show?.name ?? '',
              art: s.item.album?.images?.at(-1)?.url ?? s.item.show?.images?.at(-1)?.url ?? null,
              duration: s.item.duration_ms,
            }
          : null,
      })
    } catch (err) {
      if (err instanceof SpotifyError && err.status === 401) fail(err)
    }
  }, [fail])

  // Register this window as a Spotify Connect speaker.
  useEffect(() => {
    if (!connected) return
    let player: LocalPlayer | null = null
    let alive = true
    startLocalPlayer(() => void refresh(), (msg) => alive && setMessage(msg))
      .then((p) => {
        player = p
        return p.deviceId
      })
      .then((id) => alive && setLocalId(id))
      .catch((err) => alive && setMessage(err.message))
    return () => {
      alive = false
      player?.disconnect()
    }
  }, [connected, refresh])

  useEffect(() => {
    if (!connected) return
    void refresh()
    const every = open ? 3000 : 9000
    const t = setInterval(() => !document.hidden && void refresh(), every)
    return () => clearInterval(t)
  }, [connected, open, refresh])

  useEffect(() => {
    if (!open || !connected) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    if (playlists === null) {
      api<{ items: { id: string; name: string; uri: string; images?: { url: string }[] | null }[] }>('/me/playlists?limit=50')
        .then((r) => setPlaylists((r?.items ?? []).filter(Boolean).map((p) => ({ id: p.id, name: p.name, uri: p.uri, image: p.images?.at(-1)?.url ?? null }))))
        .catch(fail)
    }
    api<{ devices: Device[] }>('/me/player/devices')
      .then((r) => setDevices(r?.devices ?? []))
      .catch(() => {})
    return () => clearInterval(t)
  }, [open, connected, playlists, fail, localId])

  // Search once typing pauses. Results live only in memory, never on disk.
  const q = query.trim()
  const songs = found?.q === q ? found.songs : null
  useEffect(() => {
    if (!q || !connected) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      type Raw = { tracks?: { items: { id: string; uri: string; name: string; artists: { name: string }[]; album?: { images?: { url: string }[] } }[] } }
      api<Raw>(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) =>
          setFound({
            q,
            songs: (r?.tracks?.items ?? []).filter(Boolean).map((t) => ({
              id: t.id,
              uri: t.uri,
              name: t.name,
              artists: t.artists.map((a) => a.name).join(', '),
              image: t.album?.images?.at(-1)?.url ?? null,
            })),
          }),
        )
        .catch((err) => err.name !== 'AbortError' && fail(err))
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, connected, fail])

  const target = state.device?.id ?? localId
  const withDevice = (path: string) => (target ? `${path}${path.includes('?') ? '&' : '?'}device_id=${target}` : path)
  const act = async (fn: () => Promise<unknown>) => {
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      fail(err)
    }
    setTimeout(() => void refresh(), 450)
  }

  const togglePlay = () =>
    act(async () => {
      setState((s) => ({ ...s, playing: !s.playing, progress: s.progress + (s.playing ? Date.now() - s.at : 0), at: Date.now() }))
      await api(withDevice(state.playing ? '/me/player/pause' : '/me/player/play'), { method: 'PUT' })
    })
  const skip = (dir: 'next' | 'previous') => act(() => api(withDevice(`/me/player/${dir}`), { method: 'POST' }))
  const playContext = (uri: string) => act(() => api(withDevice('/me/player/play'), { method: 'PUT', body: JSON.stringify({ context_uri: uri }) }))
  const playSong = (uri: string) => act(() => api(withDevice('/me/player/play'), { method: 'PUT', body: JSON.stringify({ uris: [uri] }) }))
  const transfer = (id: string) => act(() => api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [id], play: true }) }))
  const setVolume = (v: number) => {
    setState((s) => (s.device ? { ...s, device: { ...s.device, volume: v } } : s))
    window.clearTimeout(volumeTimer.current)
    volumeTimer.current = window.setTimeout(() => void act(() => api(withDevice(`/me/player/volume?volume_percent=${v}`), { method: 'PUT' })), 250)
  }

  const connect = async () => {
    setMessage(null)
    try {
      setClientId(clientId)
      if (await login()) {
        setConnected(true)
        setPlaylists(null)
      }
    } catch (err) {
      fail(err)
    }
  }

  const progress = state.track ? Math.min(state.track.duration, state.progress + (state.playing ? Date.now() - state.at : 0)) : 0
  const knownDevices = devices.some((d) => d.id === localId) || !localId ? devices : [{ id: localId, name: 'Stillpage', is_active: false }, ...devices]

  return (
    <div className={`dock ${open ? 'open' : ''} ${zen ? 'zen' : ''}`}>
      <div className="dock-panel" aria-hidden={!open} inert={!open}>
        {connected ? (
          <>
            <div className="now">
              {state.track?.art ? <img src={state.track.art} alt="" /> : <div className="now-art"><Icon name="music" size={22} /></div>}
              <div className="now-text">
                <strong>{state.track?.name ?? 'Nothing playing'}</strong>
                <span>{state.track ? state.track.artists : 'Search for a song or pick a playlist.'}</span>
              </div>
            </div>
            <div className="now-progress">
              <span style={{ transform: `scaleX(${state.track ? progress / state.track.duration : 0})` }} />
            </div>
            <div className="controls">
              <button className="icon-btn" onClick={() => skip('previous')} aria-label="Previous">
                <Icon name="prev" size={18} />
              </button>
              <button className="play-btn" onClick={togglePlay} aria-label={state.playing ? 'Pause' : 'Play'}>
                <Icon name={state.playing ? 'pause' : 'play'} size={20} />
              </button>
              <button className="icon-btn" onClick={() => skip('next')} aria-label="Next">
                <Icon name="next" size={18} />
              </button>
              <label className="volume" title="Volume">
                <Icon name="volume" size={16} />
                <input type="range" min={0} max={100} value={state.device?.volume ?? 60} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
              </label>
            </div>
            {knownDevices.length > 0 && (
              <label className="device">
                <Icon name="device" size={15} />
                <select value={state.device?.id ?? ''} onChange={(e) => e.target.value && transfer(e.target.value)} aria-label="Playback device">
                  {!state.device && <option value="">Choose where to play</option>}
                  {knownDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id === localId ? 'This window' : d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              className="dock-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.stopPropagation()
                  setQuery('')
                } else if (e.key === 'Enter' && songs?.[0]) void playSong(songs[0].uri)
              }}
              placeholder="Search for a song"
              aria-label="Search Spotify for a song"
              spellCheck={false}
            />
            {q ? (
              <div className="playlists">
                {songs === null && <p className="dock-hint">Searching…</p>}
                {songs?.length === 0 && <p className="dock-hint">No songs match that.</p>}
                {songs?.map((s) => (
                  <button key={s.id} className="playlist" onClick={() => playSong(s.uri)}>
                    {s.image ? <img src={s.image} alt="" /> : <span className="pl-art" />}
                    <span className="song">
                      <span>{s.name}</span>
                      <small>{s.artists}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="playlists">
                {playlists === null && <p className="dock-hint">Loading your playlists…</p>}
                {playlists?.length === 0 && <p className="dock-hint">No playlists on this account yet.</p>}
                {playlists?.map((p) => (
                  <button key={p.id} className="playlist" onClick={() => playContext(p.uri)}>
                    {p.image ? <img src={p.image} alt="" /> : <span className="pl-art" />}
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {message && <p className="dock-msg">{message}</p>}
            <button
              className="link-btn"
              onClick={() => {
                logout()
                setConnected(false)
                setState(EMPTY)
                setLocalId(null)
              }}
            >
              Disconnect Spotify
            </button>
          </>
        ) : (
          <>
            <p className="dock-title">Music without leaving the page</p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                const url = toEmbed(embedDraft)
                if (!url) return setMessage('Paste a Spotify playlist, album or track link.')
                setMessage(null)
                setEmbed(url)
                setEmbedDraft('')
                localStorage.setItem(EMBED_KEY, url)
              }}
            >
              <input value={embedDraft} onChange={(e) => setEmbedDraft(e.target.value)} placeholder="Paste a Spotify playlist link" spellCheck={false} />
              <button className="btn small">Play</button>
            </form>
            {message && <p className="dock-msg">{message}</p>}
            {embed && (
              <>
                <iframe key={embedKey} className="embed" src={embed} title="Spotify player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
                {web && webSignedIn === false && (
                  <div className="dock-row">
                    <p className="dock-hint">You hear 30-second previews until you sign in.</p>
                    <button className="btn small spotify" onClick={() => void signInWeb()}>
                      Sign in for full songs
                    </button>
                  </div>
                )}
                <div className="dock-row">
                  <button
                    className="link-btn"
                    onClick={() => {
                      setEmbed(null)
                      localStorage.removeItem(EMBED_KEY)
                    }}
                  >
                    Remove player
                  </button>
                  {web && webSignedIn && (
                    <button className="link-btn" onClick={() => void signOutWeb()}>
                      Sign out of Spotify
                    </button>
                  )}
                </div>
              </>
            )}
            {!embed && <p className="dock-hint">In Spotify, open a playlist, choose Share, then Copy link to playlist.</p>}
            {getClientId() && (
              <button className="btn spotify" onClick={connect}>
                Connect Spotify
              </button>
            )}
            <details className="setup">
              <summary>Control Spotify with Premium (optional)</summary>
              <ol>
                <li>
                  Create an app at{' '}
                  <button className="link-btn inline" onClick={() => openExternal('https://developer.spotify.com/dashboard')}>
                    developer.spotify.com
                  </button>
                  .
                </li>
                <li>
                  Add this redirect URI: <code>{REDIRECT_URI}</code>
                </li>
                <li>Tick Web API and Web Playback SDK.</li>
                <li>Paste the Client ID here.</li>
              </ol>
              <div className="inline-form">
                <input value={clientId} onChange={(e) => setClientIdDraft(e.target.value)} placeholder="Client ID" spellCheck={false} />
                <button className="btn small" disabled={!clientId.trim()} onClick={connect}>
                  Connect
                </button>
              </div>
              <p className="dock-hint">Nothing leaves this computer except calls to Spotify.</p>
            </details>
          </>
        )}
      </div>
      <div className="dock-pill">
        <button className="dock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Music">
          <span className={`dock-disc ${state.playing ? 'spinning' : ''}`}>
            <Icon name="music" size={16} />
          </span>
          <span className="dock-label">{state.track ? state.track.name : 'Music'}</span>
        </button>
        {connected && state.track && (
          <button className="icon-btn" onClick={togglePlay} aria-label={state.playing ? 'Pause' : 'Play'}>
            <Icon name={state.playing ? 'pause' : 'play'} size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
