import type { Activity, Category, PEvent } from '../types'
import { fmtDur, occsOn, toMin } from '../util'

export function Stats({ dates, events, cats, activities }: { dates: Date[]; events: PEvent[]; cats: Category[]; activities: Activity[] }) {
  const planned: Record<string, number> = {}, tracked: Record<string, number> = {}, focus: Record<string, number> = {}
  for (const d of dates)
    for (const o of occsOn(events, d)) planned[o.catId] = (planned[o.catId] ?? 0) + toMin(o.end) - toMin(o.start)
  for (const a of activities) {
    tracked[a.catId] = (tracked[a.catId] ?? 0) + ((a.endedAt ?? Date.now()) - a.startedAt) / 60000
    focus[a.catId] = (focus[a.catId] ?? 0) + a.focusMin
  }
  const max = Math.max(1, ...cats.flatMap(c => [planned[c.id] ?? 0, tracked[c.id] ?? 0]))
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

  return (
    <div className="stats">
      <div className="kpis">
        <div><b>{fmtDur(sum(planned))}</b><span>planned</span></div>
        <div><b>{fmtDur(sum(tracked))}</b><span>tracked</span></div>
        <div><b>{fmtDur(sum(focus))}</b><span>focused</span></div>
        <div><b>{sum(planned) ? Math.round(sum(tracked) / sum(planned) * 100) : 0}%</b><span>of plan done</span></div>
      </div>
      {cats.map(c => (
        <div key={c.id} className="stat-row">
          <div className="stat-name"><span className="dot" style={{ background: c.color }} />{c.name}</div>
          <div className="bars">
            <div className="bar" title="planned" style={{ width: `${(planned[c.id] ?? 0) / max * 100}%`, background: c.color, opacity: 0.3 }} />
            <div className="bar" title="tracked" style={{ width: `${(tracked[c.id] ?? 0) / max * 100}%`, background: c.color }} />
          </div>
          <div className="stat-num">{fmtDur(tracked[c.id] ?? 0)} / {fmtDur(planned[c.id] ?? 0)}<small> · {fmtDur(focus[c.id] ?? 0)} focus</small></div>
        </div>
      ))}
      <p className="muted small">Faded bar = this week’s plan (with your adjustments), solid bar = time tracked by pressing Start.</p>
    </div>
  )
}
