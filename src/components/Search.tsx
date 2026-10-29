import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Mark, PEvent, Task } from '../types'
import { DAYS, countdown, parseIso } from '../util'

type Hit =
  | { kind: 'event'; id: string; title: string; sub: string; catId: string; ev: PEvent }
  | { kind: 'task'; id: string; title: string; sub: string; catId: string; task: Task }
  | { kind: 'date'; id: string; title: string; sub: string; catId: string; mark: Mark }

interface Props {
  events: PEvent[]
  tasks: Task[]
  marks: Mark[]
  cats: Category[]
  onClose: () => void
  onEvent: (e: PEvent) => void
  onTask: (t: Task) => void
  onMark: (m: Mark) => void
}

const repeatText = (e: PEvent) =>
  e.repeat === 'none' ? parseIso(e.date || '1970-01-01').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : e.repeat === 'daily' ? 'Every day' : e.repeat === 'weekdays' ? 'Weekdays'
    : [1, 2, 3, 4, 5, 6, 0].filter(d => e.days.includes(d)).map(d => DAYS[d]).join(', ')

const LABEL = { event: 'Events', task: 'Tasks', date: 'Dates' } as const

export function Search({ events, tasks, marks, cats, onClose, onEvent, onTask, onMark }: Props) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => input.current?.focus(), [])

  const hits = useMemo<Hit[]>(() => {
    const catName = (id: string) => cats.find(c => c.id === id)?.name ?? ''
    const all: Hit[] = [
      ...events.map<Hit>(e => ({ kind: 'event', id: e.id, title: e.title, catId: e.catId, ev: e, sub: `${repeatText(e)} · ${e.start}–${e.end}`, })),
      ...tasks.map<Hit>(t => ({ kind: 'task', id: t.id, title: t.title, catId: t.catId, task: t, sub: t.done ? 'Done' : t.due ? `Due ${t.due}` : 'Task' })),
      ...marks.map<Hit>(m => ({ kind: 'date', id: m.id, title: m.title, catId: m.catId, mark: m, sub: `${m.date}${m.time ? ' ' + m.time : ''} · ${m.done ? 'done' : countdown(m.date)}` })),
    ]
    const needle = q.trim().toLowerCase()
    const extra = (h: Hit) => h.kind === 'event' ? h.ev.notes : h.kind === 'date' ? h.mark.description : ''
    const score = (h: Hit) => {
      const t = h.title.toLowerCase()
      if (!needle) return 1
      if (t.startsWith(needle)) return 4
      if (t.includes(needle)) return 3
      if (extra(h).toLowerCase().includes(needle)) return 2
      if (catName(h.catId).toLowerCase().includes(needle)) return 1
      return 0
    }
    const order = { event: 0, date: 1, task: 2 }
    return all.map(h => ({ h, s: score(h) })).filter(x => x.s > 0)
      .sort((a, b) => order[a.h.kind] - order[b.h.kind] || b.s - a.s || a.h.title.localeCompare(b.h.title))
      .map(x => x.h).slice(0, 30)
  }, [q, events, tasks, marks, cats])

  useEffect(() => setI(0), [q])
  useEffect(() => { list.current?.querySelector('.hit.on')?.scrollIntoView({ block: 'nearest' }) }, [i])

  const pick = (h: Hit | undefined) => {
    if (!h) return
    onClose()
    if (h.kind === 'event') onEvent(h.ev); else if (h.kind === 'task') onTask(h.task); else onMark(h.mark)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[i]) }
  }

  return (
    <div className="palette-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="palette" role="dialog" aria-label="Search" onKeyDown={onKey}>
        <div className="palette-input">
          <span aria-hidden>⌕</span>
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search events, tasks and dates…" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={list}>
          {hits.length === 0 && <p className="muted palette-empty">{q ? `Nothing matches “${q}”.` : 'Nothing to search yet. Add some events, tasks or dates.'}</p>}
          {hits.map((h, idx) => {
            const c = cats.find(x => x.id === h.catId)
            return (
              <div key={h.kind + h.id}>
                {(idx === 0 || hits[idx - 1].kind !== h.kind) && <h5>{LABEL[h.kind]}</h5>}
                <button className={'hit' + (idx === i ? ' on' : '')} onMouseMove={() => setI(idx)} onClick={() => pick(h)}>
                  <span className="dot" style={{ background: c?.color ?? '#7a8194' }} />
                  <span className="grow"><b>{h.title}</b><small>{h.sub}</small></span>
                  <span className="muted small">{c?.name}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot muted small"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>/</kbd> opens search any time</span></div>
      </div>
    </div>
  )
}
