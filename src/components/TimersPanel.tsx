import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useSettings } from '../db'
import { beep, notify, toast } from '../toasts'
import { uid } from '../util'
import type { TimerItem } from '../types'

const PRESETS: [string, number][] = [['5 min', 300], ['10 min', 600], ['15 min', 900], ['30 min', 1800], ['1 hour', 3600]]

/** Timers live in the browser only (key "timers" in the local store); they keep running across reloads. */
async function mutate(fn: (list: TimerItem[]) => TimerItem[] | void) {
  await db.transaction('rw', db.kv, async () => {
    const cur = ((await db.kv.get('timers'))?.value as TimerItem[] | undefined) ?? []
    await db.kv.put({ key: 'timers', value: fn(cur) ?? cur })
  })
}

/** Returns true for exactly one caller (even with several tabs open), so the alert fires once. */
async function claimDone(id: string) {
  let won = false
  await mutate(list => {
    const t = list.find(x => x.id === id)
    if (t && t.state === 'running' && t.endAt <= Date.now()) { t.state = 'done'; t.left = 0; won = true }
  })
  return won
}

const remaining = (t: TimerItem, now: number) =>
  t.state === 'running' ? Math.max(0, Math.ceil((t.endAt - now) / 1000)) : t.state === 'done' ? 0 : (t.left ?? t.total)

const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}
const words = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return [h && `${h} h`, m && `${m} min`, sec && `${sec} s`].filter(Boolean).join(' ') || '0 s'
}

export function TimersPanel() {
  const settings = useSettings()
  const timers = useLiveQuery(async () => ((await db.kv.get('timers'))?.value as TimerItem[] | undefined) ?? [], []) ?? []
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('rp.timersOpen') !== '0' } catch { return true } })
  const [label, setLabel] = useState('')
  const [h, setH] = useState(''), [m, setM] = useState(''), [s, setS] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])

  // fire the alert when a running timer reaches zero (also catches timers that ended while the page was closed)
  useEffect(() => {
    for (const t of timers) {
      if (t.state === 'running' && t.endAt <= now) {
        void claimDone(t.id).then(won => {
          if (!won) return
          notify(t.label, 'Timer finished', settings.sound)
          if (settings.sound) { setTimeout(beep, 1300); setTimeout(beep, 2600) }
          toast(`⏰ ${t.label} — time is up`, { ms: 120000, action: { label: 'Restart', fn: () => restart(t.id) } })
        })
      }
    }
  }, [now, timers, settings.sound])

  const toggleOpen = () => setOpen(o => { try { localStorage.setItem('rp.timersOpen', o ? '0' : '1') } catch { /* ignore */ } return !o })

  const add = (seconds: number, name = '') => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    return mutate(list => [...list, { id: uid(), label: name.trim() || words(seconds), total: seconds, state: 'running', endAt: Date.now() + seconds * 1000, left: null }])
  }
  const pause = (id: string) => mutate(list => { const t = list.find(x => x.id === id); if (t && t.state === 'running') { t.left = remaining(t, Date.now()); t.state = 'paused' } })
  const resume = (id: string) => mutate(list => { const t = list.find(x => x.id === id); if (t && t.state === 'paused') { t.endAt = Date.now() + (t.left ?? t.total) * 1000; t.state = 'running'; t.left = null } })
  const reset = (id: string) => mutate(list => { const t = list.find(x => x.id === id); if (t) { t.state = 'idle'; t.left = null } })
  const restart = (id: string) => mutate(list => { const t = list.find(x => x.id === id); if (t) { t.state = 'running'; t.endAt = Date.now() + t.total * 1000; t.left = null } })
  const remove = (id: string) => mutate(list => list.filter(x => x.id !== id))

  const startCustom = (e: React.FormEvent) => {
    e.preventDefault()
    const secs = (+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0)
    if (secs <= 0) return setErr('Enter a time greater than zero.')
    if (secs > 99 * 3600) return setErr('The maximum is 99 hours.')
    setErr(''); void add(secs, label)
    setLabel(''); setH(''); setM(''); setS('')
  }

  const running = timers.filter(t => t.state === 'running')
  const soonest = running.length ? Math.min(...running.map(t => remaining(t, now))) : null
  const status = soonest !== null ? `${clock(soonest)}${running.length > 1 ? ` · +${running.length - 1} more` : ''}` : timers.length ? `${timers.length} timer${timers.length > 1 ? 's' : ''}` : 'Set a timer'

  return (
    <section className={'card pomo timers' + (open ? ' open' : '')}>
      <button type="button" className="pomo-toggle" aria-expanded={open} onClick={toggleOpen}>
        <h2>Timers</h2>
        <span className={'pomo-status' + (running.length ? ' live' : '')}>{status}</span>
        <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="pomo-body">
          <div className="presets" role="group" aria-label="Quick timers">
            {PRESETS.map(([name, secs]) => <button key={secs} type="button" onClick={() => add(secs)}>{name}</button>)}
          </div>

          <form className="custom-timer" onSubmit={startCustom}>
            <span className="field-label">Custom time</span>
            <div className="hms">
              <label><input inputMode="numeric" type="number" min={0} max={99} placeholder="0" value={h} onChange={e => setH(e.target.value)} aria-label="Hours" /><small>h</small></label>
              <label><input inputMode="numeric" type="number" min={0} max={999} placeholder="0" value={m} onChange={e => setM(e.target.value)} aria-label="Minutes" /><small>min</small></label>
              <label><input inputMode="numeric" type="number" min={0} max={999} placeholder="0" value={s} onChange={e => setS(e.target.value)} aria-label="Seconds" /><small>s</small></label>
            </div>
            <div className="timer-add">
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional), e.g. Tea" aria-label="Timer label" />
              <button className="primary" type="submit">Start</button>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
          </form>

          <ul className="timer-list">
            {timers.length === 0 && <li className="muted small">No timers yet. Pick a preset or enter any time.</li>}
            {timers.map(t => {
              const left = remaining(t, now)
              const pct = t.total ? Math.min(100, ((t.total - left) / t.total) * 100) : 0
              return (
                <li key={t.id} className={'timer-item ' + t.state}>
                  <div className="timer-top">
                    <span className="grow"><b>{t.label}</b><small className="muted"> · {words(t.total)}</small></span>
                    <button className="icon" title="Remove" aria-label={`Remove ${t.label}`} onClick={() => remove(t.id)}>✕</button>
                  </div>
                  <div className="timer-main">
                    <span className="timer-time">{t.state === 'done' ? 'Time is up' : clock(left)}</span>
                    <span className="timer-actions">
                      {t.state === 'running' && <button onClick={() => pause(t.id)}>Pause</button>}
                      {t.state === 'paused' && <button className="primary" onClick={() => resume(t.id)}>Resume</button>}
                      {t.state === 'idle' && <button className="primary" onClick={() => restart(t.id)}>Start</button>}
                      {t.state === 'done' && <button className="primary" onClick={() => restart(t.id)}>Restart</button>}
                      {(t.state === 'running' || t.state === 'paused') && <button onClick={() => reset(t.id)}>Reset</button>}
                    </span>
                  </div>
                  <div className="timer-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
