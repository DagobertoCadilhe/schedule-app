import type { Occ, PEvent } from './types'

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const HOUR_PX = 48

const p2 = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const fmtT = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`
export const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }
export const uid = () => crypto.randomUUID()
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const mondayOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)) }
export const fmtDur = (min: number) => min < 60 ? `${Math.round(min)}m` : `${Math.floor(min / 60)}h${p2(Math.round(min % 60))}`
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function occursOn(ev: PEvent, d: Date): boolean {
  const ds = iso(d)
  if (ev.skip.includes(ds)) return false
  if (ev.repeat === 'none') return ev.date === ds
  if (ev.date && ds < ev.date) return false
  const dow = d.getDay()
  if (ev.repeat === 'daily') return true
  if (ev.repeat === 'weekdays') return dow >= 1 && dow <= 5
  return ev.days.includes(dow)
}

export function occsOn(events: PEvent[], d: Date): Occ[] {
  const ds = iso(d)
  return events.filter(e => occursOn(e, d)).map(ev => {
    const o = ev.over?.[ds]
    return {
      ev, date: ds, adjusted: !!o, done: ev.done?.includes(ds) ?? false,
      title: o?.title ?? ev.title, catId: o?.catId ?? ev.catId,
      start: o?.start ?? ev.start, end: o?.end ?? ev.end,
    }
  }).sort((a, b) => toMin(a.start) - toMin(b.start))
}

export const daysUntil = (date: string) => Math.round((parseIso(date).getTime() - parseIso(iso(new Date())).getTime()) / 864e5)
export const countdown = (date: string) => {
  const n = daysUntil(date)
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 0 ? `In ${n} days` : `${-n} days ago`
}
