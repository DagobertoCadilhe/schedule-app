import { useEffect, useState } from 'react'
import type { MarkApi } from './Marks'
import { addDays, iso, mondayOf } from '../util'

export function MiniCal({ anchor, onPick, marks }: { anchor: Date; onPick: (d: Date) => void; marks: MarkApi }) {
  const [month, setMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  useEffect(() => { setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) }, [anchor])
  const start = mondayOf(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const today = iso(new Date()), sel = iso(anchor)
  const weekStart = iso(mondayOf(anchor)), weekEnd = iso(addDays(mondayOf(anchor), 6))

  return (
    <div className="mini">
      <div className="mini-head">
        <b>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <span>
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </span>
      </div>
      <div className="mini-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <i key={i}>{d}</i>)}
        {days.map(d => {
          const s = iso(d)
          const cls = (d.getMonth() !== month.getMonth() ? 'out ' : '') + (s === today ? 'today ' : '') + (s === sel ? 'sel ' : '') + (s >= weekStart && s <= weekEnd ? 'wk' : '')
          const ms = marks.byDate.get(s)
          return (
            <button key={s} className={cls + (ms ? ' mark' : '')} style={ms ? { ['--m' as string]: marks.color(ms[0]) } : undefined}
              onClick={() => onPick(d)}
              onMouseEnter={ms ? e => marks.hover(ms, e.currentTarget) : undefined} onMouseLeave={ms ? () => marks.hover(null) : undefined}>{d.getDate()}</button>
          )
        })}
      </div>
    </div>
  )
}
