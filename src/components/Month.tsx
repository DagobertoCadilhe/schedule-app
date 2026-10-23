import type { CSSProperties } from 'react'
import type { Category, Occ, PEvent } from '../types'
import type { MarkApi } from './Marks'
import { DAYS, addDays, iso, mondayOf, occsOn } from '../util'

interface Props {
  anchor: Date
  events: PEvent[]
  cats: Category[]
  onPickDay: (d: Date) => void
  onOpen: (o: Occ) => void
  marks: MarkApi
}

export function Month({ anchor, events, cats, onPickDay, onOpen, marks }: Props) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = mondayOf(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const today = iso(new Date())
  const color = (id: string) => cats.find(c => c.id === id)?.color ?? '#7a8194'

  return (
    <div className="month">
      <div className="month-head">{[1, 2, 3, 4, 5, 6, 0].map(d => <div key={d}>{DAYS[d]}</div>)}</div>
      <div className="month-grid">
        {days.map(d => {
          const occs = occsOn(events, d)
          const ms = marks.byDate.get(iso(d)) ?? []
          const inMonth = d.getMonth() === anchor.getMonth()
          return (
            <div key={+d} className={'mcell' + (inMonth ? '' : ' out') + (iso(d) === today ? ' today' : '') + (ms.length ? ' has-mark' : '')}
              style={ms.length ? { ['--m' as string]: marks.color(ms[0]) } : undefined} onClick={() => onPickDay(d)}>
              <div className="mhead"><b>{d.getDate()}</b><button className="addmark" title="Add date reminder" onClick={e => { e.stopPropagation(); marks.add(iso(d)) }}>+</button></div>
              {ms.map(m => (
                <button key={m.id} className="mk" style={{ ['--m' as string]: marks.color(m) }}
                  onMouseEnter={e => marks.hover([m], e.currentTarget)} onMouseLeave={() => marks.hover(null)}
                  onClick={e => { e.stopPropagation(); marks.hover(null); marks.open(m) }}>⚑ {m.title}</button>
              ))}
              {occs.slice(0, 3).map(o => (
                <button key={o.ev.id} className={'chip' + (o.done ? ' done' : '')} style={{ '--c': color(o.catId) } as CSSProperties}
                  onClick={e => { e.stopPropagation(); onOpen(o) }}>
                  <i />{o.done ? '✓ ' : ''}{o.start} {o.title}
                </button>
              ))}
              {occs.length > 3 && <small className="muted">+{occs.length - 3} more</small>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
