import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Category, StartSrc, Task } from '../types'
import { iso, uid } from '../util'

interface Props {
  cats: Category[]
  onFocus: (src: StartSrc) => void
  onPlan: (t: Task) => void
  flashId?: string | null
}

export function TasksPanel({ cats, onFocus, onPlan, flashId }: Props) {
  const tasks = useLiveQuery(() => db.tasks.orderBy('created').toArray(), []) ?? []
  const [title, setTitle] = useState('')
  const [catId, setCatId] = useState('')
  const [due, setDue] = useState('')
  const [showDone, setShowDone] = useState(false)
  const today = iso(new Date())
  useEffect(() => {
    if (!flashId) return
    const t = tasks.find(x => x.id === flashId)
    if (t) setShowDone(t.done)
    setTimeout(() => document.getElementById('task-' + flashId)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashId])
  const color = (id: string) => cats.find(c => c.id === id)?.color ?? '#7a8194'

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await db.tasks.add({ id: uid(), title: title.trim(), catId: catId || cats[0]?.id || '', done: false, due, created: Date.now() })
    setTitle(''); setDue('')
  }
  const open = tasks.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.created - b.created)
  const done = tasks.filter(t => t.done)
  const shown = showDone ? done : open

  return (
    <section className="card">
      <div className="card-head">
        <h2>Tasks <span className="count">{open.length}</span></h2>
        <button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? 'Show open' : `Done (${done.length})`}</button>
      </div>
      <form className="task-add" onSubmit={add}>
        <input placeholder="Add a task…" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="task-opts">
          <select value={catId} onChange={e => setCatId(e.target.value)} aria-label="Category">
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Due date" />
          <button className="primary" type="submit">Add</button>
        </div>
      </form>
      <ul className="tasks">
        {shown.length === 0 && <li className="muted small">{showDone ? 'Nothing completed yet.' : 'No open tasks. Nice.'}</li>}
        {shown.map(t => (
          <li key={t.id} id={'task-' + t.id} className={(t.done ? 'done' : '') + (t.id === flashId ? ' flash' : '')}>
            <input type="checkbox" checked={t.done} aria-label={`Mark ${t.title} done`}
              onChange={e => db.tasks.update(t.id, { done: e.target.checked, doneAt: e.target.checked ? Date.now() : undefined })} />
            <span className="dot" style={{ background: color(t.catId) }} />
            <span className="grow">
              {t.title}
              {t.due && <small className={t.due < today && !t.done ? 'late' : 'muted'}> · {t.due === today ? 'today' : t.due < today ? `overdue ${t.due}` : t.due}</small>}
            </span>
            {!t.done && <button className="icon" title="Focus on this now" onClick={() => onFocus({ title: t.title, catId: t.catId })}>▶</button>}
            {!t.done && <button className="icon" title="Put it on the calendar" onClick={() => onPlan(t)}>＋</button>}
            <button className="icon" title="Delete" onClick={() => db.tasks.delete(t.id)}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
