import { db, patchSettings } from './db'
import { parseIcs, type IcsEvent } from './ics'
import { touch } from './sync'
import type { Category, Mark, PEvent } from './types'
import { iso } from './util'

/**
 * Canvas import: the Canvas "Calendar Feed" (.ics) holds class/calendar events and assignment due dates.
 * Calendar events become one-off events; assignments become date reminders. Everything imported gets an id
 * starting with "canvas:" so a later import updates it in place and removes what was deleted in Canvas.
 */
const PREFIX = 'canvas:'
const COLORS = ['#e0544b', '#3fa7d6', '#59c27a', '#f2a541', '#9b6bd6', '#e06ba8', '#4fc1b4', '#c9a227']

export interface ImportResult { events: number; marks: number; removed: number; courses: number }

const p2 = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`

/** Canvas titles end with the course in brackets: "Homework 3 [MATH 101-001]". */
function splitCourse(summary: string): { title: string; course: string } {
  const m = /^(.*\S)\s*\[([^\]]+)\]\s*$/.exec(summary)
  return m ? { title: m[1], course: m[2].trim() } : { title: summary, course: '' }
}

const isDeadline = (e: IcsEvent) => e.allDay || e.end.getTime() <= e.start.getTime() || /assignment/i.test(e.uid)

/** Fetches the feed through the local server (browsers can't read Canvas directly because of CORS). */
export async function fetchFeed(url: string): Promise<string> {
  const res = await fetch('/api/ics', { method: 'POST', headers: { 'X-Schedule': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  const out = await res.json().catch(() => ({})) as { text?: string; error?: string }
  if (!res.ok || !out.text) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out.text
}

export async function importIcs(text: string): Promise<ImportResult> {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('This is not a calendar (.ics) file')
  const items = parseIcs(text)

  const cats = await db.cats.toArray()
  const catFor = new Map<string, string>()
  const newCats: Category[] = []
  const catId = (course: string) => {
    const name = course || 'Canvas'
    let id = catFor.get(name)
    if (id) return id
    id = cats.find(c => c.name === name)?.id
    if (!id) {
      id = PREFIX + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (!cats.some(c => c.id === id) && !newCats.some(c => c.id === id))
        newCats.push({ id, name, color: COLORS[(cats.filter(c => c.id.startsWith(PREFIX)).length + newCats.length) % COLORS.length] })
    }
    catFor.set(name, id)
    return id
  }

  const events: PEvent[] = [], marks: Mark[] = []
  for (const e of items) {
    const { title, course } = splitCourse(e.summary)
    const id = PREFIX + e.uid
    const cat = catId(course)
    if (isDeadline(e)) {
      const lines = [e.allDay ? '' : `Due ${hm(e.start)}`, course, e.url, e.description].filter(Boolean)
      marks.push({ id, date: iso(e.start), title, description: lines.join('\n'), catId: cat, notify: 1 })
    } else {
      // events running past midnight are cut at the end of their first day
      const end = iso(e.end) === iso(e.start) ? hm(e.end) : '23:59'
      events.push({
        id, title, catId: cat, start: hm(e.start), end, repeat: 'none', days: [], date: iso(e.start),
        remind: 10, skip: [], notes: [e.url, e.description].filter(Boolean).join('\n\n'),
      })
    }
  }

  let removed = 0
  await db.transaction('rw', [db.events, db.marks, db.cats], async () => {
    if (newCats.length) await db.cats.bulkAdd(newCats)
    const oldEv = new Map((await db.events.where('id').startsWith(PREFIX).toArray()).map(x => [x.id, x]))
    const oldMk = new Map((await db.marks.where('id').startsWith(PREFIX).toArray()).map(x => [x.id, x]))
    // keep what the user set themselves (reminder time, done ticks, alert days, a category they picked)
    await db.events.bulkPut(events.map(ev => {
      const o = oldEv.get(ev.id)
      return o ? { ...o, title: ev.title, start: ev.start, end: ev.end, date: ev.date, notes: ev.notes } : ev
    }))
    await db.marks.bulkPut(marks.map(mk => {
      const o = oldMk.get(mk.id)
      return o ? { ...o, title: mk.title, date: mk.date, description: mk.description } : mk
    }))
    const keepEv = new Set(events.map(x => x.id)), keepMk = new Set(marks.map(x => x.id))
    const goneEv = [...oldEv.keys()].filter(id => !keepEv.has(id)), goneMk = [...oldMk.keys()].filter(id => !keepMk.has(id))
    await db.events.bulkDelete(goneEv); await db.marks.bulkDelete(goneMk)
    removed = goneEv.length + goneMk.length
  })
  touch()
  return { events: events.length, marks: marks.length, removed, courses: catFor.size }
}

/** Downloads the saved feed URL and imports it. */
export async function syncCanvas(url: string): Promise<ImportResult> {
  const r = await importIcs(await fetchFeed(url))
  await patchSettings({ canvasSyncedAt: Date.now() })
  return r
}

export const describe = (r: ImportResult) =>
  `Canvas: ${r.events} class events, ${r.marks} due dates${r.courses ? ` across ${r.courses} course${r.courses === 1 ? '' : 's'}` : ''}${r.removed ? `, ${r.removed} removed` : ''}`
