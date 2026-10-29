// Spotify Web API with Authorization Code + PKCE. No client secret is ever
// needed or stored; tokens live in localStorage on this machine only.

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

export const REDIRECT_URI = window.stillpage ? 'http://127.0.0.1:43117/callback' : `${location.origin}/`
const TOKEN_KEY = 'stillpage.spotify.token'
const CLIENT_KEY = 'stillpage.spotify.clientId'

interface Tokens {
  access: string
  refresh: string
  expiresAt: number
}

export function getClientId(): string {
  return localStorage.getItem(CLIENT_KEY) || (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || ''
}
export function setClientId(id: string) {
  localStorage.setItem(CLIENT_KEY, id.trim())
}

function readTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null')
  } catch {
    return null
  }
}
function saveTokens(json: { access_token: string; refresh_token?: string; expires_in: number }) {
  const prev = readTokens()
  const tokens: Tokens = {
    access: json.access_token,
    refresh: json.refresh_token ?? prev?.refresh ?? '',
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function isConnected(): boolean {
  return !!readTokens()?.refresh
}
export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function postToken(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) throw new Error(`Spotify sign-in failed (${res.status}).`)
  saveTokens(await res.json())
}

/** Opens Spotify's consent page. Resolves true once tokens are stored. */
export async function login(): Promise<boolean> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Add your Spotify Client ID first.')
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)))
  const url = new URL('https://accounts.spotify.com/authorize')
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  }).toString()

  if (window.stillpage) {
    const result = await window.stillpage.spotifyAuth(url.toString())
    if (!result) return false
    return finish(new URL(result), verifier, state)
  }
  sessionStorage.setItem('stillpage.spotify.pkce', JSON.stringify({ verifier, state }))
  location.href = url.toString()
  return false
}

async function finish(callback: URL, verifier: string, state: string): Promise<boolean> {
  const error = callback.searchParams.get('error')
  if (error) throw new Error(error === 'access_denied' ? 'Spotify access was not granted.' : `Spotify said: ${error}`)
  if (callback.searchParams.get('state') !== state) throw new Error('Spotify sign-in expired. Try connecting again.')
  await postToken({
    client_id: getClientId(),
    grant_type: 'authorization_code',
    code: callback.searchParams.get('code') ?? '',
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })
  return true
}

/** Browser-only: completes a redirect-based login when the page loads. */
export async function handleWebCallback() {
  const url = new URL(location.href)
  const saved = sessionStorage.getItem('stillpage.spotify.pkce')
  if (!saved || !(url.searchParams.has('code') || url.searchParams.has('error'))) return
  sessionStorage.removeItem('stillpage.spotify.pkce')
  history.replaceState(null, '', url.pathname)
  const { verifier, state } = JSON.parse(saved)
  try {
    await finish(url, verifier, state)
  } catch (err) {
    console.warn(err)
  }
}

let refreshing: Promise<void> | null = null

export async function getToken(): Promise<string | null> {
  const t = readTokens()
  if (!t) return null
  if (Date.now() < t.expiresAt) return t.access
  refreshing ??= postToken({ client_id: getClientId(), grant_type: 'refresh_token', refresh_token: t.refresh }).finally(() => {
    refreshing = null
  })
  try {
    await refreshing
  } catch {
    logout()
    return null
  }
  return readTokens()?.access ?? null
}

export class SpotifyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await getToken()
  if (!token) throw new SpotifyError(401, 'Not connected to Spotify.')
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (res.status === 204 || res.status === 202) return null
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const reason = body?.error?.reason
    const message =
      reason === 'PREMIUM_REQUIRED' || res.status === 403
        ? 'Playback control needs Spotify Premium.'
        : reason === 'NO_ACTIVE_DEVICE'
          ? 'Nothing is playing. Pick a device or a playlist.'
          : (body?.error?.message ?? `Spotify request failed (${res.status}).`)
    throw new SpotifyError(res.status, message)
  }
  return body as T
}

// ---- Web Playback SDK (turns this window into a Spotify Connect speaker) ----

interface SdkPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, cb: (payload: never) => void): void
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume: number }) => SdkPlayer }
  }
}

let sdkPromise: Promise<void> | null = null
function loadSdk(): Promise<void> {
  sdkPromise ??= new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.onerror = () => reject(new Error('Could not load the Spotify player.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

export interface LocalPlayer {
  deviceId: Promise<string>
  disconnect(): void
}

/** Registers "Stillpage" as a playback device. Needs Premium + Widevine. */
export async function startLocalPlayer(onState: () => void, onError: (msg: string) => void): Promise<LocalPlayer> {
  await loadSdk()
  const player = new window.Spotify!.Player({
    name: 'Stillpage',
    volume: 0.6,
    getOAuthToken: (cb) => void getToken().then((t) => t && cb(t)),
  })
  const deviceId = new Promise<string>((resolve) => {
    player.addListener('ready', ({ device_id }: { device_id: string }) => resolve(device_id))
  })
  player.addListener('player_state_changed', () => onState())
  player.addListener('initialization_error', ({ message }: { message: string }) =>
    onError(`This build cannot stream audio itself (${message}). Control another device instead.`),
  )
  player.addListener('authentication_error', () => onError('Spotify sign-in expired. Connect again.'))
  player.addListener('account_error', () => onError('Playing inside Stillpage needs Spotify Premium.'))
  await player.connect()
  return { deviceId, disconnect: () => player.disconnect() }
}
