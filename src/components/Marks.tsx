import { useEffect, useRef, useState } from 'react'
import { db, setMarkDone } from '../db'
import type { Category, Mark } from '../types'
import { countdown, daysUntil, iso, markEnd, markWhen, nowMin, parseIso, toMin, uid } from '../util'

/** Shared plumbing so every calendar surface can highlight dates, show a hover preview and open details. */
export interface MarkApi {
  byDate: Map<string, Mark[]>
  color: (m: Mark) => string
  hover: (ms: Mark[] | null, el?: HTMLElement) => void
  open: (m: Mark) => void
  add: (date: string) => void
}

const longDate = (d: string) => parseIso(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export function MarkPop({ pop, color }: { pop: { marks: Mark[]; rect: DOMRect } | null; color: (m: Mark) => string }) {
  if (!pop) return null
  const { rect, marks } = pop
  const left = Math.min(rect.left, window.innerWidth - 290)
  const below = rect.bottom + 8 + 150 < window.innerHeight
  return (
    <div className="markpop" style={{ left: Math.max(8, left), top: below ? rect.bottom + 8 : undefined, bottom: below ? undefined : window.innerHeight - rect.top + 8 }}>
      {marks.map(m => (
        <div key={m.id} className="markpop-item" style={{ ['--m' as string]: color(m) }}>
          <b>{m.done ? '✓ ' : ''}{m.title}</b>
          <small>{m.done ? 'Done · ' : ''}{longDate(m.date)}{m.time ? ` · ${markWhen(m)}` : ''} · {countdown(m.date)}</small>
          {m.description && <p>{m.description.length > 140 ? m.description.slice(0, 140) + '…' : m.description}</p>}
        </div>
      ))}
      <small className="muted">Click for details</small>
    </div>
  )
}

interface DlgProps {
  mark: Mark | null // null → new
  date: string
  mode: 'view' | 'edit'
  cats: Category[]
  onClose: () => void
}

const NOTIFY = [[-1, 'No alert'], [0, 'On the day'], [1, 'From 1 day before'], [3, 'From 3 days before'], [7, 'From 1 week before'], [14, 'From 2 weeks before']] as const
const AT_TIME = [[-1, 'No alert at the time'], [0, 'When it starts'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before']] as const

export function MarkDialog({ mark, date, mode: initial, cats, onClose }: DlgProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState(initial)
  const [f, setF] = useState<Mark>(mark ?? { id: uid(), date, title: '', description: '', catId: cats[0]?.id ?? '', notify: 1 })
  const [timed, setTimed] = useState(!!mark?.time)
  const [err, setErr] = useState('')
  useEffect(() => { ref.current?.showModal() }, [])
  const cat = cats.find(c => c.id === f.catId)
  const set = <K extends keyof Mark>(k: K, v: Mark[K]) => setF(p => ({ ...p, [k]: v }))
  const close = () => ref.current?.close()

  const setAllDay = (allDay: boolean) => {
    setTimed(!allDay); setErr('')
    setF(p => allDay ? { ...p, time: undefined, endTime: undefined, remindMin: undefined } : { ...p, time: p.time ?? '09:00', remindMin: p.remindMin ?? 15 })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (timed && !f.time) return setErr('Pick a start time, or choose "All day".')
    if (timed && f.endTime && toMin(f.endTime) <= toMin(f.time!)) return setErr('The end time must be after the start time.')
    const data: Mark = { ...f, title: f.title.trim() }
    if (!timed) { delete data.time; delete data.endTime; delete data.remindMin }
    else if (!data.endTime) delete data.endTime
    await db.marks.put(data)
    close()
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) close() }}>
      {mode === 'view' && mark ? (
        <div className="markview" style={{ ['--m' as string]: cat?.color }}>
          <header className="dlg-head">
            <span className="pill"><i />{cat?.name ?? 'Reminder'}</span>
            <button type="button" className="x" aria-label="Close" onClick={close}>✕</button>
          </header>
          <div className="dlg-body">
            <h3 className="mark-title">{mark.title}</h3>
            <p className="when">{longDate(mark.date)}</p>
            <p className="when-time">{markWhen(mark)}</p>
            <p className={'count' + (mark.done || daysUntil(mark.date) < 0 ? ' past' : '')}>{mark.done ? '✓ Done' : countdown(mark.date)}</p>
            <h4>Description</h4>
            <p className="desc">{mark.description || <span className="muted">No description.</span>}</p>
            <h4>Alert</h4>
            <p className="desc">{NOTIFY.find(n => n[0] === mark.notify)?.[1]}</p>
            {mark.time && <p className="desc">{AT_TIME.find(n => n[0] === (mark.remindMin ?? 15))?.[1]}</p>}
          </div>
          <footer className="dlg-foot">
            <button className="danger" onClick={async () => { await db.marks.delete(mark.id); close() }}>Delete</button>
            <span className="spacer" />
            <button className="ok" onClick={async () => { await setMarkDone(mark.id, !mark.done); close() }}>{mark.done ? 'Mark not done' : '✓ Mark done'}</button>
            <button onClick={() => setMode('edit')}>Edit</button>
            <button className="primary" onClick={close}>Close</button>
          </footer>
        </div>
      ) : (
        <form onSubmit={save}>
          <header className="dlg-head">
            <h3>{mark ? 'Edit date reminder' : 'New date reminder'}</h3>
            <button type="button" className="x" aria-label="Close" onClick={close}>✕</button>
          </header>
          <div className="dlg-body">
            <section>
              <label>Title<input autoFocus required value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Project deadline" /></label>
              <label>Date<input type="date" required value={f.date} onChange={e => set('date', e.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={!timed} onChange={e => setAllDay(e.target.checked)} />All day</label>
              {timed && (
                <div className="two">
                  <label>Starts<input type="time" required value={f.time ?? ''} onChange={e => set('time', e.target.value)} /></label>
                  <label>Ends (optional)<input type="time" value={f.endTime ?? ''} onChange={e => set('endTime', e.target.value || undefined)} /></label>
                </div>
              )}
              <label>Description
                <textarea rows={4} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Shown when you hover the date and when you open it" />
              </label>
            </section>
            <section>
              <div className="two">
                <label>Category (color)
                  <select value={f.catId} onChange={e => set('catId', e.target.value)}>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Heads-up before the day
                  <select value={f.notify} onChange={e => set('notify', +e.target.value)}>
                    {NOTIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              {timed && (
                <label>Alert on the day
                  <select value={f.remindMin ?? 15} onChange={e => set('remindMin', +e.target.value)}>
                    {AT_TIME.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              )}
            </section>
            {err && <p className="err" role="alert">{err}</p>}
          </div>
          <footer className="dlg-foot">
            <span className="spacer" />
            <button type="button" onClick={() => (mark ? setMode('view') : close())}>Cancel</button>
            <button type="submit" className="primary">{mark ? 'Save changes' : 'Add reminder'}</button>
          </footer>
        </form>
      )}
    </dialog>
  )
}

export function UpcomingMarks({ marks, api }: { marks: Mark[]; api: MarkApi }) {
  const nm = nowMin()
  const list = marks
    .filter(m => { if (m.done) return false; const d = daysUntil(m.date); return d > 0 || (d === 0 && !(m.time && toMin(markEnd(m)) <= nm)) })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  return (
    <section className="card">
      <div className="card-head">
        <h2>Important dates <span className="count">{list.length}</span></h2>
        <button className="link" onClick={() => api.add(iso(new Date()))}>+ Add</button>
      </div>
      <ul className="upcoming scroll" tabIndex={list.length > 5 ? 0 : undefined} aria-label="Upcoming important dates">
        {list.length === 0 && <li className="muted">No upcoming dates. Add deadlines, trips, birthdays…</li>}
        {list.map(m => (
          <li key={m.id} className="clickable" onClick={() => api.open(m)}>
            <span className="dot" style={{ background: api.color(m) }} />
            <span className="grow">{m.title}</span>
            <small className="muted">{countdown(m.date)}{m.time ? ` · ${m.time}` : ''}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
