import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import type { Category, Mark } from '../types'
import { countdown, daysUntil, iso, parseIso, uid } from '../util'

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
          <b>{m.title}</b>
          <small>{longDate(m.date)} · {countdown(m.date)}</small>
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

export function MarkDialog({ mark, date, mode: initial, cats, onClose }: DlgProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState(initial)
  const [f, setF] = useState<Mark>(mark ?? { id: uid(), date, title: '', description: '', catId: cats[0]?.id ?? '', notify: 1 })
  useEffect(() => { ref.current?.showModal() }, [])
  const cat = cats.find(c => c.id === f.catId)
  const set = <K extends keyof Mark>(k: K, v: Mark[K]) => setF(p => ({ ...p, [k]: v }))
  const close = () => ref.current?.close()

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
            <p className={'count' + (daysUntil(mark.date) < 0 ? ' past' : '')}>{countdown(mark.date)}</p>
            <h4>Description</h4>
            <p className="desc">{mark.description || <span className="muted">No description.</span>}</p>
            <h4>Alert</h4>
            <p className="desc">{NOTIFY.find(n => n[0] === mark.notify)?.[1]}</p>
          </div>
          <footer className="dlg-foot">
            <button className="danger" onClick={async () => { await db.marks.delete(mark.id); close() }}>Delete</button>
            <span className="spacer" />
            <button onClick={() => setMode('edit')}>Edit</button>
            <button className="primary" onClick={close}>Close</button>
          </footer>
        </div>
      ) : (
        <form onSubmit={async e => { e.preventDefault(); await db.marks.put({ ...f, title: f.title.trim() }); close() }}>
          <header className="dlg-head">
            <h3>{mark ? 'Edit date reminder' : 'New date reminder'}</h3>
            <button type="button" className="x" aria-label="Close" onClick={close}>✕</button>
          </header>
          <div className="dlg-body">
            <section>
              <label>Title<input autoFocus required value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Project deadline" /></label>
              <label>Date<input type="date" required value={f.date} onChange={e => set('date', e.target.value)} /></label>
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
                <label>Alert
                  <select value={f.notify} onChange={e => set('notify', +e.target.value)}>
                    {NOTIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
            </section>
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
  const list = marks.filter(m => daysUntil(m.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  return (
    <section className="card">
      <div className="card-head">
        <h2>Important dates</h2>
        <button className="link" onClick={() => api.add(iso(new Date()))}>+ Add</button>
      </div>
      <ul className="upcoming">
        {list.length === 0 && <li className="muted">No upcoming dates. Add deadlines, trips, birthdays…</li>}
        {list.map(m => (
          <li key={m.id} className="clickable" onClick={() => api.open(m)}>
            <span className="dot" style={{ background: api.color(m) }} />
            <span className="grow">{m.title}</span>
            <small className="muted">{countdown(m.date)}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
