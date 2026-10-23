import { useState } from 'react'
import { PHASE_NAME, usePomodoro } from '../pomodoro'
import { patchSettings, setDone } from '../db'
import type { Category } from '../types'
import { fmtT, iso } from '../util'

const R = 64, C = 2 * Math.PI * R

export function PomodoroPanel({ cats, focusToday }: { cats: Category[]; focusToday: Record<string, number> }) {
  const { state, remaining, settings, activity, toggle, skip, reset, stopActivity } = usePomodoro()
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0'), ss = String(remaining % 60).padStart(2, '0')
  const progress = state.total ? 1 - remaining / state.total : 0
  const color = state.phase === 'focus' ? 'var(--accent)' : 'var(--green)'
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('rp.pomoOpen') === '1' } catch { return false } })
  const toggleOpen = () => setOpen(o => { try { localStorage.setItem('rp.pomoOpen', o ? '0' : '1') } catch { /* ignore */ } return !o })
  const total = Object.values(focusToday).reduce((a, b) => a + b, 0)

  const num = (k: 'focus' | 'short' | 'long' | 'every', label: string) => (
    <label>{label}
      <input type="number" min={1} max={k === 'every' ? 10 : 180} value={settings[k]}
        onChange={e => patchSettings({ [k]: Math.max(1, +e.target.value || 1) })} />
    </label>
  )

  return (
    <section className={'card pomo' + (open ? ' open' : '')}>
      <button type="button" className="pomo-toggle" aria-expanded={open} onClick={toggleOpen}>
        <h2>Pomodoro</h2>
        <span className={'pomo-status' + (state.running ? ' live' : '')}>
          {state.running || state.left !== null ? `${mm}:${ss} · ${PHASE_NAME[state.phase]}${activity ? ` · ${activity.title}` : ''}` : 'Click to open'}
        </span>
        <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="pomo-body">
      {activity ? (
        <div className="activity">
          <span className="dot" style={{ background: cats.find(c => c.id === activity.catId)?.color }} />
          <span><b>{activity.title}</b><br /><small>since {fmtT(new Date(activity.startedAt).getHours() * 60 + new Date(activity.startedAt).getMinutes())}
            {activity.plannedEnd ? ` · planned end ${fmtT(new Date(activity.plannedEnd).getHours() * 60 + new Date(activity.plannedEnd).getMinutes())}` : ''}</small></span>
          <div className="act-btns">
            <button className="ok" title="Finish this activity and mark it done for today" onClick={async () => { if (activity.eventId) await setDone(activity.eventId, iso(new Date(activity.startedAt)), true); stopActivity() }}>✓ Done</button>
            <button onClick={stopActivity}>Stop</button>
          </div>
        </div>
      ) : <p className="muted center">No activity attached — press Start on an event.</p>}
      <div className="ring">
        <svg viewBox="0 0 150 150" aria-hidden>
          <circle cx="75" cy="75" r={R} className="track" />
          <circle cx="75" cy="75" r={R} className="bar" stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <div className="ring-text"><div className="time">{mm}:{ss}</div><div className="muted">{PHASE_NAME[state.phase]}</div></div>
      </div>
      <div className="row">
        <button className="primary" onClick={toggle}>{state.running ? 'Pause' : 'Start'}</button>
        <button onClick={skip}>Skip</button>
        <button onClick={reset}>Reset</button>
      </div>
      <p className="muted center small">
        {total ? `Focus today: ${total}m — ${Object.entries(focusToday).map(([id, m]) => `${cats.find(c => c.id === id)?.name ?? 'Other'} ${m}m`).join(' · ')}` : 'No focus time logged today'}
      </p>
      <div className="two4">
        {num('focus', 'Focus')}{num('short', 'Short')}{num('long', 'Long')}{num('every', 'Long every')}
      </div>
      </div>}
    </section>
  )
}
