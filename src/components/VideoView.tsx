import { useEffect, useRef, useState } from 'react'
import { setVideoPosition } from '../lib/library'
import type { Item } from '../lib/types'
import { EMBED_ORIGIN, embedUrl, registerPlayer, setPlayerShown, type Player } from '../lib/youtube'
import { Icon } from './Icon'

const PLAYING = 1

/** A YouTube video with YouTube's own controls. Remembers where you stopped,
 *  pauses when its tab is hidden, and lends its clock to timestamps in notes. */
export function VideoView({ item, active }: { item: Item; active: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const video = item.video!
  // The start time is fixed when the player loads; seeking does the rest.
  const [src] = useState(() => embedUrl({ ...video, start: item.position }))
  const state = useRef({ time: item.position ?? 0, at: 0, playing: false, duration: 0, saved: 0 })

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const post = (msg: object) => el.contentWindow?.postMessage(JSON.stringify({ ...msg, id: item.id, channel: 'widget' }), EMBED_ORIGIN)
    const s = state.current
    const time = () => s.time + (s.playing ? (performance.now() - s.at) / 1000 : 0)
    const save = () => {
      const t = time()
      // Finished, or nearly: next time starts from the top.
      setVideoPosition(item.id, s.duration && t > s.duration - 15 ? 0 : Math.floor(t))
      s.saved = performance.now()
    }
    const player: Player = {
      itemId: item.id,
      videoId: video.id,
      time,
      playing: () => s.playing,
      command: (func, args = []) => post({ event: 'command', func, args }),
    }
    const unregister = registerPlayer(player)

    const onMessage = (e: MessageEvent) => {
      if (e.source !== el.contentWindow || e.origin !== EMBED_ORIGIN || typeof e.data !== 'string') return
      let msg: { event?: string; info?: { currentTime?: number; playerState?: number; duration?: number } }
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      const info = msg.info
      if (msg.event !== 'infoDelivery' && msg.event !== 'initialDelivery') return
      if (!info) return
      if (typeof info.currentTime === 'number') {
        s.time = info.currentTime
        s.at = performance.now()
      }
      if (typeof info.duration === 'number' && info.duration > 0) s.duration = info.duration
      if (typeof info.playerState === 'number') {
        const was = s.playing
        s.playing = info.playerState === PLAYING
        if (was && !s.playing) save()
      }
      if (s.playing && performance.now() - s.saved > 10000) save()
    }
    // The player only reports its state to a page that says it is listening.
    const listen = () => post({ event: 'listening' })
    window.addEventListener('message', onMessage)
    el.addEventListener('load', listen)
    listen()
    return () => {
      window.removeEventListener('message', onMessage)
      el.removeEventListener('load', listen)
      if (s.at) save()
      unregister()
    }
  }, [item.id, video.id])

  useEffect(() => {
    setPlayerShown(item.id, active)
    if (!active && state.current.playing) frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [], id: item.id, channel: 'widget' }), EMBED_ORIGIN)
    return () => setPlayerShown(item.id, false)
  }, [active, item.id])

  return (
    <div className="video">
      <div className="video-stage">
        <iframe
          ref={frame}
          src={src}
          title={item.title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="video-bar">
        <button className="btn small quiet" onClick={() => window.dispatchEvent(new CustomEvent('stillpage:timestamp'))} title="Put the current time in your note (Alt T)">
          <Icon name="timer" size={14} /> Timestamp to note
        </button>
        <span className="video-keys">
          <kbd>Alt K</kbd> play or pause · <kbd>Alt J</kbd> <kbd>Alt L</kbd> back or ahead 10 s
        </span>
      </div>
    </div>
  )
}
