/** Minimal iCalendar (.ics) reader: enough for Canvas calendar feeds and most exported calendars. */

export interface IcsEvent {
  uid: string
  summary: string
  description: string
  url: string
  start: Date
  end: Date
  allDay: boolean
}

interface Prop { name: string; params: Record<string, string>; value: string }

const unescape = (s: string) => s.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))

function parseProp(line: string): Prop | null {
  // NAME;PARAM=VAL;PARAM="V:AL":value (the first ':' outside quotes ends the parameters)
  let q = false, i = 0
  for (; i < line.length; i++) {
    if (line[i] === '"') q = !q
    else if (line[i] === ':' && !q) break
  }
  if (i === line.length) return null
  const [name, ...ps] = line.slice(0, i).split(';')
  const params: Record<string, string> = {}
  for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '') }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) }
}

/** Offset (ms) of a time zone at a given instant, using the browser's tz database. */
function tzOffset(tz: string, at: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at
}

function parseDate(p: Prop): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h === undefined) return { date: new Date(+y, +mo - 1, +d), allDay: true }
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))
  if (z) return { date: new Date(wall), allDay: false }
  const tz = p.params.TZID
  if (tz) {
    try {
      // two passes so times next to a DST switch land on the right offset
      let t = wall - tzOffset(tz, wall)
      t = wall - tzOffset(tz, t)
      return { date: new Date(t), allDay: false }
    } catch { /* unknown zone name: treat as local time */ }
  }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)), allDay: false }
}

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Expands simple DAILY/WEEKLY rules into single occurrences (capped), which is all a schedule feed needs. */
function expand(ev: IcsEvent, rule: string, exdates: Set<number>, until: Date): IcsEvent[] {
  const r = Object.fromEntries(rule.split(';').map(kv => kv.split('=') as [string, string]))
  if (r.FREQ !== 'DAILY' && r.FREQ !== 'WEEKLY') return [ev]
  const interval = Math.max(1, Number(r.INTERVAL ?? 1))
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  let last = until
  if (r.UNTIL) { const u = parseDate({ name: 'UNTIL', params: {}, value: r.UNTIL }); if (u && u.date < last) last = u.date }
  const days = r.BYDAY ? r.BYDAY.split(',').map(x => DOW[x.slice(-2)]).filter(x => x !== undefined) : [ev.start.getDay()]
  const len = ev.end.getTime() - ev.start.getTime()
  const out: IcsEvent[] = []
  const weekStart = new Date(ev.start); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  for (let k = 0, n = 0; n < count && out.length < 500; k++) {
    const base = new Date(ev.start)
    const cands: Date[] = []
    if (r.FREQ === 'DAILY') { base.setDate(base.getDate() + k * interval); cands.push(base) }
    else for (const dw of days) {
      const d = new Date(weekStart); d.setDate(d.getDate() + k * 7 * interval + dw)
      d.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0)
      cands.push(d)
    }
    if (cands[0] > last) break
    for (const d of cands.sort((a, b) => a.getTime() - b.getTime())) {
      if (d < ev.start || d > last || n >= count) continue
      n++
      if (exdates.has(d.getTime())) continue
      out.push({ ...ev, uid: `${ev.uid}#${d.getTime()}`, start: d, end: new Date(d.getTime() + len) })
    }
  }
  return out
}

export function parseIcs(text: string, horizon = new Date(Date.now() + 365 * 864e5)): IcsEvent[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: IcsEvent[] = []
  let cur: Prop[] | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = []; continue }
    if (line === 'END:VEVENT') {
      if (cur) out.push(...toEvent(cur, horizon))
      cur = null; continue
    }
    if (cur) { const p = parseProp(line); if (p) cur.push(p) }
  }
  return out
}

function toEvent(props: Prop[], horizon: Date): IcsEvent[] {
  const get = (n: string) => props.find(p => p.name === n)
  const ds = get('DTSTART') && parseDate(get('DTSTART')!)
  if (!ds) return []
  const de = get('DTEND') && parseDate(get('DTEND')!)
  let end = de?.date
  if (!end) {
    const dur = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(get('DURATION')?.value ?? '')
    end = new Date(ds.date)
    if (dur) end.setTime(end.getTime() + (((+(dur[1] ?? 0) * 7 + +(dur[2] ?? 0)) * 24 + +(dur[3] ?? 0)) * 60 + +(dur[4] ?? 0)) * 60000)
    else if (ds.allDay) end.setDate(end.getDate() + 1)
  }
  const ev: IcsEvent = {
    uid: get('UID')?.value ?? `${get('SUMMARY')?.value}-${ds.date.getTime()}`,
    summary: unescape(get('SUMMARY')?.value ?? '').trim() || '(untitled)',
    description: unescape(get('DESCRIPTION')?.value ?? '').trim(),
    url: get('URL')?.value.trim() ?? '',
    start: ds.date, end, allDay: ds.allDay,
  }
  const rule = get('RRULE')?.value
  if (!rule) return [ev]
  const ex = new Set<number>()
  for (const p of props.filter(x => x.name === 'EXDATE'))
    for (const v of p.value.split(',')) { const d = parseDate({ ...p, value: v }); if (d) ex.add(d.date.getTime()) }
  return expand(ev, rule, ex, horizon)
}
