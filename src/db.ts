import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_SETTINGS, type Activity, type Category, type PEvent, type Settings, type Task, type Mark } from './types'
import { uid } from './util'

export interface KV { key: string; value: unknown }

class PlannerDB extends Dexie {
  events!: Table<PEvent, string>
  cats!: Table<Category, string>
  activities!: Table<Activity, string>
  fired!: Table<{ key: string; at: number }, string>
  kv!: Table<KV, string>
  tasks!: Table<Task, string>
  marks!: Table<Mark, string>

  constructor() {
    super('reminder-planner')
    this.version(1).stores({
      events: 'id',
      cats: 'id',
      activities: 'id, startedAt, catId',
      fired: 'key, at',
      kv: 'key',
    })
    this.version(2).stores({ tasks: 'id, done, created' })
    this.version(3).stores({ marks: 'id, date' })
    this.on('populate', tx => {
      tx.table('cats').bulkAdd(defaultCats()) // starts empty apart from a few editable categories
    })
  }
}

export const db = new PlannerDB()

export const defaultCats = (): Category[] => [
  { id: 'work', name: 'Work', color: '#5b7cfa' },
  { id: 'health', name: 'Health', color: '#2fb27a' },
  { id: 'study', name: 'Study', color: '#a465e0' },
  { id: 'personal', name: 'Personal', color: '#e8962e' },
]

const WD = [1, 2, 3, 4, 5]
const mk = (title: string, catId: string, start: string, end: string, days: number[], remind = 10): PEvent => ({
  id: uid(), title, catId, start, end, repeat: days.length === 7 ? 'daily' : 'custom',
  days, date: '', remind, skip: [], notes: '',
})
export const defaultEvents = (): PEvent[] => [
  mk('Morning routine', 'personal', '07:00', '08:00', [0, 1, 2, 3, 4, 5, 6], 0),
  mk('Deep work', 'work', '09:00', '12:00', WD),
  mk('Lunch', 'personal', '12:30', '13:30', WD, 0),
  mk('Meetings / email', 'work', '14:00', '16:00', WD),
  mk('Gym', 'health', '18:00', '19:00', [1, 3, 5], 30),
  mk('Study session', 'study', '20:00', '21:30', [2, 4, 6]),
  mk('Plan next week', 'personal', '17:00', '17:30', [0], 15),
]

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), [])
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }), [row])
}

export async function patchSettings(p: Partial<Settings>) {
  const cur = ((await db.kv.get('settings'))?.value as Partial<Settings>) ?? {}
  await db.kv.put({ key: 'settings', value: { ...cur, ...p } })
}

/** Adds the example week (and the categories it uses) without touching anything you already have. */
export async function loadSampleWeek() {
  await db.transaction('rw', [db.events, db.cats], async () => {
    for (const c of defaultCats()) if (!(await db.cats.get(c.id))) await db.cats.add(c)
    await db.events.bulkAdd(defaultEvents())
  })
}

/** Deletes every event, task, date reminder and log. Keeps your settings; categories go back to the 4 defaults. */
export async function clearAllData() {
  await db.transaction('rw', [db.events, db.cats, db.activities, db.tasks, db.marks, db.fired, db.kv], async () => {
    await Promise.all([db.events.clear(), db.cats.clear(), db.activities.clear(), db.tasks.clear(), db.marks.clear(), db.fired.clear()])
    await db.cats.bulkAdd(defaultCats())
    await db.kv.where('key').notEqual('settings').delete()
  })
}

/** Marks one occurrence of an event as done (or not done) for a specific day. */
export async function setDone(eventId: string, date: string, done: boolean) {
  await db.events.where('id').equals(eventId).modify(e => {
    const s = new Set(e.done ?? [])
    if (done) s.add(date); else s.delete(date)
    e.done = [...s]
  })
}

/** Marks a date reminder as done (or not done). */
export async function setMarkDone(id: string, done: boolean) {
  await db.marks.update(id, { done })
}

export async function exportAll() {
  const data = {
    version: 1,
    events: await db.events.toArray(), cats: await db.cats.toArray(),
    activities: await db.activities.toArray(), tasks: await db.tasks.toArray(), marks: await db.marks.toArray(), kv: await db.kv.toArray(),
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = `schedule-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  URL.revokeObjectURL(url)
}

export async function importAll(file: File) {
  const d = JSON.parse(await file.text())
  if (!Array.isArray(d.events) || !Array.isArray(d.cats)) throw new Error('Not a planner backup file')
  await db.transaction('rw', [db.events, db.cats, db.activities, db.kv, db.fired, db.tasks, db.marks], async () => {
    await Promise.all([db.events.clear(), db.cats.clear(), db.activities.clear(), db.kv.clear(), db.fired.clear(), db.tasks.clear(), db.marks.clear()])
    await db.events.bulkAdd(d.events); await db.cats.bulkAdd(d.cats)
    await db.activities.bulkAdd(d.activities ?? []); await db.kv.bulkAdd(d.kv ?? []); await db.tasks.bulkAdd(d.tasks ?? []); await db.marks.bulkAdd(d.marks ?? [])
  })
}
