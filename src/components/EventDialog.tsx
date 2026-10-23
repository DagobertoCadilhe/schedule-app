import { useEffect, useRef, useState } from 'react'
import type { Category, PEvent, Repeat } from '../types'
import { DAYS, parseIso, toMin } from '../util'

export type Scope = 'day' | 'all'

interface Props {
  ev: PEvent | null // null → creating
  draft: PEvent // initial values (that day's values when editing an occurrence)
  occDate: string
  cats: Category[]
  onClose: () => void
  onSave: (ev: PEvent, scope: Scope) => void
  onDelete: (mode: 'all' | 'day') => void
  onResetDay: () => void
  done: boolean
  onToggleDone: () => void
}

const niceDate = (d: string) => parseIso(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export function EventDialog({ ev, draft, occDate, cats, onClose, onSave, onDelete, onResetDay, done, onToggleDone }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [f, setF] = useState<PEvent>(draft)
  const [scope, setScope] = useState<Scope>('day')
  const [err, setErr] = useState('')
  const set = <K extends keyof PEvent>(k: K, v: PEvent[K]) => setF(p => ({ ...p, [k]: v }))
  const recurring = !!ev && ev.repeat !== 'none'
  const hasOver = !!ev?.over?.[occDate]
  const dayOnly = recurring && scope === 'day'

  useEffect(() => { ref.current?.showModal() }, [])

  const toggleDay = (d: number) => set('days', f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (toMin(f.end) <= toMin(f.start)) return setErr('The end time must be after the start time.')
    if (f.repeat === 'none' && !f.date) return setErr('Pick a date for this event.')
    if (f.repeat === 'custom' && !f.days.length) return setErr('Pick at least one day of the week.')
    onSave({ ...f, title: f.title.trim() }, recurring ? scope : 'all')
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current?.close() }}>
      <form onSubmit={submit}>
        <header className="dlg-head">
          <h3>{ev ? 'Edit event' : 'New event'}</h3>
          <button type="button" className="x" aria-label="Close" onClick={() => ref.current?.close()}>✕</button>
        </header>

        <div className="dlg-body">
          {recurring && (
            <div className="scope-box">
              <span className="field-label">This event repeats. Apply changes to:</span>
              <div className="scope">
                <button type="button" className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')}>
                  <b>Only this day</b><small>{niceDate(occDate)}</small>
                </button>
                <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
                  <b>Every time</b><small>Changes the weekly plan</small>
                </button>
              </div>
            </div>
          )}

          <section>
            <h4>What</h4>
            <label>Title<input autoFocus required value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Deep work" /></label>
            <label>Category
              <select value={f.catId} onChange={e => set('catId', e.target.value)}>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </section>

          <section>
            <h4>When</h4>
            <div className="two">
              <label>Starts<input type="time" required value={f.start} onChange={e => set('start', e.target.value)} /></label>
              <label>Ends<input type="time" required value={f.end} onChange={e => set('end', e.target.value)} /></label>
            </div>
            {!dayOnly && (
              <>
                <label>Repeats
                  <select value={f.repeat} onChange={e => set('repeat', e.target.value as Repeat)}>
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Weekdays (Mon–Fri)</option>
                    <option value="custom">Selected days each week</option>
                  </select>
                </label>
                {f.repeat === 'custom' && (
                  <div className="daypick" role="group" aria-label="Days of the week">
                    {[1, 2, 3, 4, 5, 6, 0].map(d => (
                      <button type="button" key={d} className={f.days.includes(d) ? 'on' : ''} aria-pressed={f.days.includes(d)} onClick={() => toggleDay(d)}>{DAYS[d]}</button>
                    ))}
                  </div>
                )}
                <label>{f.repeat === 'none' ? 'Date' : 'Starting from (optional)'}
                  <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
                </label>
              </>
            )}
          </section>

          <section>
            <h4>Reminder &amp; notes</h4>
            <label>Alert me
              <select value={f.remind} onChange={e => set('remind', +e.target.value)}>
                <option value={-1}>No alert</option>
                <option value={0}>When it starts</option>
                {[5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m === 60 ? '1 hour' : `${m} minutes`} before</option>)}
              </select>
            </label>
            <label>Notes<input value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" /></label>
          </section>

          {err && <p className="err" role="alert">{err}</p>}
        </div>

        <footer className="dlg-foot">
          {ev && (
            <div className="foot-left">
              <button type="button" className="ok" onClick={onToggleDone}>{done ? 'Mark not done' : `✓ Mark done for ${niceDate(occDate)}`}</button>
              {recurring && hasOver && <button type="button" onClick={onResetDay}>Reset day to plan</button>}
              {recurring && <button type="button" className="danger" onClick={() => onDelete('day')}>Skip this day</button>}
              <button type="button" className="danger" onClick={() => onDelete('all')}>{recurring ? 'Delete event' : 'Delete'}</button>
            </div>
          )}
          <div className="foot-right">
            <button type="button" onClick={() => ref.current?.close()}>Cancel</button>
            <button type="submit" className="primary">{ev ? 'Save changes' : 'Create event'}</button>
          </div>
        </footer>
      </form>
    </dialog>
  )
}
