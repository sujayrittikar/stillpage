import { useEffect, useState } from 'react'
import { Icon } from './Icon'

function chime() {
  try {
    const ctx = new AudioContext()
    ;[523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.35
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 2.5)
    })
    setTimeout(() => void ctx.close(), 3500)
  } catch {
    /* audio unavailable */
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function FocusTimer({ onDone }: { onDone: (minutes: number) => void }) {
  const [end, setEnd] = useState<number | null>(null)
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const [minutes, setMinutes] = useState(25)
  const [now, setNow] = useState(Date.now())
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (end === null || pausedLeft !== null) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= end) {
        setEnd(null)
        chime()
        onDone(minutes)
      }
    }, 500)
    return () => clearInterval(t)
  }, [end, pausedLeft, minutes, onDone])

  const running = end !== null
  const left = pausedLeft ?? (end ? end - now : 0)

  return (
    <div className="timer">
      <button className={`rail-btn ${running ? 'timer-on' : ''}`} title={running ? 'Focus session' : 'Start a focus session'} onClick={() => setMenu((m) => !m)}>
        <Icon name="timer" />
        {running && <span className="timer-left">{fmt(left)}</span>}
      </button>
      {menu && (
        <>
          <div className="scrim clear" onClick={() => setMenu(false)} />
          <div className="popover timer-menu">
            {!running ? (
              <>
                <p className="pop-line">Focus for</p>
                <div className="timer-choices">
                  {[15, 25, 50, 90].map((m) => (
                    <button
                      key={m}
                      className="btn small quiet"
                      onClick={() => {
                        setMinutes(m)
                        setNow(Date.now())
                        setEnd(Date.now() + m * 60000)
                        setPausedLeft(null)
                        setMenu(false)
                      }}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="timer-choices">
                <button
                  className="btn small quiet"
                  onClick={() => {
                    if (pausedLeft !== null) {
                      setEnd(Date.now() + pausedLeft)
                      setNow(Date.now())
                      setPausedLeft(null)
                    } else setPausedLeft(end! - Date.now())
                    setMenu(false)
                  }}
                >
                  {pausedLeft !== null ? 'Resume' : 'Pause'}
                </button>
                <button
                  className="btn small quiet"
                  onClick={() => {
                    setEnd(null)
                    setPausedLeft(null)
                    setMenu(false)
                  }}
                >
                  End session
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
