import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setDone, useSettings } from './db'
import { PomodoroProvider, usePomodoro } from './pomodoro'
import { useReminders } from './reminders'
import { dismiss, toast, useToasts } from './toasts'
import { Grid } from './components/Grid'
import { Month } from './components/Month'
import { MiniCal } from './components/MiniCal'
import { EventDialog, type Scope } from './components/EventDialog'
import { PomodoroPanel } from './components/PomodoroPanel'
import { TasksPanel } from './components/TasksPanel'
import { TimersPanel } from './components/TimersPanel'
import { Stats } from './components/Stats'
import { CategoriesDialog, InstallHelp, SettingsDialog } from './components/Dialogs'
import { isInstalled, useInstall } from './pwa'
import { Search } from './components/Search'
import { useSyncStatus } from './sync'
import { syncCanvas } from './canvas'
import { MarkDialog, MarkPop, UpcomingMarks, type MarkApi } from './components/Marks'
import type { Mark, Occ, PEvent, Task } from './types'
import { addDays, iso, mondayOf, nowMin, occsOn, occursOn, parseIso, toMin, uid } from './util'

type View = 'day' | 'week' | 'month' | 'stats'
type Editor = { ev: PEvent | null; draft: PEvent; date: string } | null

const blank = (date: string, start = '09:00', end = '10:00', catId = '', title = ''): PEvent => ({
  id: uid(), title, catId, start, end, repeat: 'none', days: [], date, remind: 10, skip: [], notes: '',
})

const ICONS: Record<string, string> = {
  day: 'M4 5h16v14H4z M4 9h16 M8 13h4',
  week: 'M3 5h18v14H3z M9 5v14 M15 5v14',
  month: 'M3 5h18v14H3z M3 10h18 M9 5v14 M15 5v14',
  stats: 'M5 20V10 M12 20V4 M19 20v-7',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19 12h2 M3 12h2 M12 3v2 M12 19v2 M17 7l1.5-1.5 M5.5 18.5L7 17 M17 17l1.5 1.5 M5.5 5.5L7 7',
  tag: 'M20 12l-8 8-9-9V3h8z M7.5 7.5h.01',
}
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name]} />
  </svg>
)

function Shell() {
  const settings = useSettings()
  const events = useLiveQuery(() => db.events.toArray(), [])
  const cats = useLiveQuery(() => db.cats.toArray(), [])
  const marks = useLiveQuery(() => db.marks.toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const [searching, setSearching] = useState(false)
  const [flashTask, setFlashTask] = useState<string | null>(null)
  const [markDlg, setMarkDlg] = useState<{ mark: Mark | null; date: string; mode: 'view' | 'edit' } | null>(null)
  const [pop, setPop] = useState<{ marks: Mark[]; rect: DOMRect } | null>(null)
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [editor, setEditor] = useState<Editor>(null)
  const [dlg, setDlg] = useState<'cats' | 'settings' | 'install' | null>(null)
  const { startActivity } = usePomodoro()
  const toasts = useToasts()
  const install = useInstall()
  const sync = useSyncStatus()
  const [, setTick] = useState(0)

  useReminders(events, marks, settings, startActivity, m => setMarkDlg({ mark: m, date: m.date, mode: 'view' }))
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 15000); return () => clearInterval(t) }, [])

  // keep the Canvas import fresh: re-check the saved feed every 6 hours while the app is open
  useEffect(() => {
    if (!settings.canvasUrl) return
    const check = () => {
      if (Date.now() - settings.canvasSyncedAt < 6 * 3600_000) return
      syncCanvas(settings.canvasUrl).catch(() => undefined) // quiet: a manual import shows any error
    }
    check()
    const t = setInterval(check, 30 * 60_000)
    return () => clearInterval(t)
  }, [settings.canvasUrl, settings.canvasSyncedAt])

  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : settings.theme === 'dark'
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  const dates = useMemo(() => {
    if (view === 'day') return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())]
    if (view === 'month') return Array.from({ length: 42 }, (_, i) => addDays(mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), i))
    const m = mondayOf(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(m, i))
  }, [view, anchor])

  const from = dates[0].getTime(), to = addDays(dates[dates.length - 1], 1).getTime()
  const rangeActs = useLiveQuery(() => db.activities.where('startedAt').between(from, to).toArray(), [from, to]) ?? []
  const todayStart = parseIso(iso(new Date())).getTime()
  const todayActs = useLiveQuery(() => db.activities.where('startedAt').aboveOrEqual(todayStart).toArray(), [todayStart]) ?? []
  const focusToday: Record<string, number> = {}
  todayActs.forEach(a => { if (a.focusMin) focusToday[a.catId] = (focusToday[a.catId] ?? 0) + a.focusMin })

  const step = (n: number) => setAnchor(a => view === 'month' ? new Date(a.getFullYear(), a.getMonth() + n, 1)
    : addDays(a, n * (view === 'day' ? 1 : 7)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey) return
      if (e.key === '/') setSearching(true)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 't') setAnchor(new Date())
      else if (e.key === 'd') setView('day')
      else if (e.key === 'w') setView('week')
      else if (e.key === 'm') setView('month')
      else if (e.key === 's') setView('stats')
      else if (e.key === 'n') openNew(iso(new Date()))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!events || !cats || !marks || !tasks) return null
  const byDate = new Map<string, Mark[]>()
  marks.forEach(m => byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]))
  const markApi: MarkApi = {
    byDate,
    color: m => cats.find(c => c.id === m.catId)?.color ?? '#ff8a3d',
    hover: (ms, el) => setPop(ms && el ? { marks: ms, rect: el.getBoundingClientRect() } : null),
    open: m => setMarkDlg({ mark: m, date: m.date, mode: 'view' }),
    add: date => setMarkDlg({ mark: null, date, mode: 'edit' }),
  }
  const firstCat = cats[0]?.id ?? ''

  const openNew = (date: string, start?: string, end?: string, title = '', catId = firstCat) =>
    setEditor({ ev: null, draft: blank(date, start, end, catId, title), date })
  const openEv = (o: Occ) =>
    setEditor({ ev: o.ev, draft: { ...o.ev, title: o.title, catId: o.catId, start: o.start, end: o.end }, date: o.date })
  /** Jump to the next day an event occurs (or its date) and open it. */
  const showEvent = (ev: PEvent) => {
    let d = new Date(); d.setHours(0, 0, 0, 0)
    let found: Date | null = null
    for (let k = 0; k < 400 && !found; k++) { const x = addDays(d, k); if (occursOn(ev, x)) found = x }
    if (!found && ev.date) found = parseIso(ev.date)
    d = found ?? d
    setAnchor(d); if (view === 'month' || view === 'stats') setView('week')
    const o = occsOn([ev], d)[0]
    if (o) openEv(o)
  }
  const showTask = (t: Task) => { setFlashTask(t.id); setTimeout(() => setFlashTask(null), 2500) }
  const showMark = (m: Mark) => { setAnchor(parseIso(m.date)); markApi.open(m) }
  const planTask = (t: Task) => {
    const m = Math.ceil((nowMin() + 5) / 15) * 15
    openNew(iso(new Date()), fmtMin(Math.min(m, 23 * 60)), fmtMin(Math.min(m + 60, 24 * 60 - 1)), t.title, t.catId)
  }

  const save = async (f: PEvent, scope: Scope) => {
    const cur = editor?.ev
    if (cur && cur.repeat !== 'none' && scope === 'day') {
      const over = { ...(cur.over ?? {}), [editor.date]: { title: f.title, catId: f.catId, start: f.start, end: f.end } }
      await db.events.update(cur.id, { over, remind: f.remind, notes: f.notes })
    } else {
      const over = { ...(f.over ?? {}) }
      if (cur) delete over[editor.date]
      await db.events.put({ ...f, over })
    }
    setEditor(null)
  }
  const del = async (mode: 'all' | 'day') => {
    if (!editor?.ev) return
    if (mode === 'all') await db.events.delete(editor.ev.id)
    else await db.events.update(editor.ev.id, { skip: [...editor.ev.skip, editor.date] })
    setEditor(null)
  }
  const resetDay = async () => {
    const ev = editor?.ev; if (!ev) return
    const over = { ...(ev.over ?? {}) }; delete over[editor.date]
    await db.events.update(ev.id, { over }); setEditor(null)
  }

  /** Drag/resize: a one-time event moves for real; a recurring one is adjusted for that day only. */
  const move = async (o: Occ, toDate: string, start: string, end: string) => {
    const ev = o.ev
    if (ev.repeat === 'none') { await db.events.update(ev.id, { date: toDate, start, end }); return }
    if (toDate === o.date) {
      await db.events.update(ev.id, { over: { ...(ev.over ?? {}), [o.date]: { ...(ev.over?.[o.date] ?? {}), start, end } } })
      toast(`Adjusted "${o.title}" for ${o.date} only`, { ms: 8000, action: {
        label: 'Make it the plan', fn: async () => {
          const cur = await db.events.get(ev.id); if (!cur) return
          const over = { ...(cur.over ?? {}) }; delete over[o.date]
          await db.events.update(ev.id, { start, end, over })
        },
      } })
    } else {
      const over = { ...(ev.over ?? {}) }; delete over[o.date]
      await db.events.update(ev.id, { skip: [...ev.skip, o.date], over })
      await db.events.add({ ...blank(toDate, start, end, o.catId, o.title), remind: ev.remind, notes: ev.notes })
      toast(`Moved "${o.title}" to ${toDate}; the weekly plan is unchanged`)
    }
  }
  const resetWeek = async () => {
    if (!confirm('Undo all adjustments in this week and go back to the weekly plan? One-off events you added are kept.')) return
    const ds = new Set(dates.map(iso))
    await db.events.toCollection().modify(e => {
      if (e.over) for (const k of Object.keys(e.over)) if (ds.has(k)) delete e.over[k]
      e.skip = e.skip.filter(s => !ds.has(s))
    })
    toast('Week reset to the plan')
  }

  const todayD = new Date(), nm = nowMin()
  const todays = occsOn(events, todayD)
  const next = todays.filter(o => toMin(o.end) > nm && !o.done).slice(0, 6)
  const doneToday = todays.filter(o => o.done).length
  const catOf = (id: string) => cats.find(c => c.id === id)
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o)
  const title = view === 'day' ? fmt(dates[0], { weekday: 'long', month: 'long', day: 'numeric' })
    : view === 'month' ? fmt(anchor, { month: 'long', year: 'numeric' })
    : `${fmt(dates[0], { month: 'short', day: 'numeric' })} – ${fmt(dates[6], { month: 'short', day: 'numeric' })}`
  const sub = view === 'day' ? String(dates[0].getFullYear()) : view === 'week' || view === 'stats' ? String(dates[6].getFullYear()) : ''

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand"><span className="logo" />Schedule</div>
        <div className="navs">
          {(['day', 'week', 'month', 'stats'] as View[]).map(v => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              <Icon name={v} />{v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <MiniCal marks={markApi} anchor={anchor} onPick={d => { setAnchor(d); if (view === 'month' || view === 'stats') setView('week') }} />
        <div className="legend">
          <div className="legend-head"><span>Categories</span><button className="link" onClick={() => setDlg('cats')}>Edit</button></div>
          {cats.map(c => <div key={c.id}><span className="dot" style={{ background: c.color }} />{c.name}</div>)}
        </div>
        {!isInstalled() && <button className="install" onClick={() => (install ? install() : setDlg('install'))}>⬇ Install app</button>}
        <div className={'syncline ' + (sync.state === 'online' && !sync.pending ? 'ok' : 'warn')} title="Your data is saved to data/schedule.db on this computer">
          <span className="dot" />{sync.state === 'online' ? (sync.pending ? 'Saving…' : 'Saved locally') : sync.state === 'starting' ? 'Connecting…' : 'Server offline'}
        </div>
        <button className="navs-bottom" onClick={() => setDlg('settings')}><Icon name="settings" />Settings</button>
      </nav>

      <div className="content">
        <div className="topbar">
          <div className="title"><h1>{title}</h1><span className="muted">{sub}</span></div>
          <div className="stepper">
            <button onClick={() => step(-1)} aria-label="Previous">‹</button>
            <button onClick={() => setAnchor(new Date())}>Today</button>
            <button onClick={() => step(1)} aria-label="Next">›</button>
          </div>
          <span className="spacer" />
          {view === 'week' && <button onClick={resetWeek} title="Remove this week’s adjustments">Back to plan</button>}
          <button onClick={() => setSearching(true)} title="Search (press /)">⌕ Search <kbd>/</kbd></button>
          <button onClick={() => markApi.add(iso(anchor))}>⚑ Date reminder</button>
          <button className="primary" onClick={() => openNew(iso(anchor))}>+ New event</button>
        </div>

        <main>
          <section className="card main-card">
            {view === 'stats' ? <Stats dates={dates.slice(0, 7)} events={events} cats={cats} activities={rangeActs} />
              : view === 'month' ? <Month marks={markApi} anchor={anchor} events={events} cats={cats} onOpen={openEv} onPickDay={d => { setAnchor(d); setView('day') }} />
              : <Grid marks={markApi} dates={dates} events={events} cats={cats} activities={rangeActs} onCreate={(d, s, e) => openNew(d, s, e)} onOpen={openEv} onMove={move} />}
          </section>
          <aside>
            <section className="card">
              <h2>Next up today</h2>
              <ul className="upcoming">
                {next.length === 0 && <li className="muted">Nothing left today.</li>}
                {next.map(o => (
                  <li key={o.ev.id}>
                    <span className="dot" style={{ background: catOf(o.catId)?.color }} />
                    <span className="grow"><b>{o.start}</b> {o.title}{o.adjusted && <small className="muted"> · adjusted</small>}</span>
                    <button className="ok" title="Mark done for today" aria-label={`Mark ${o.title} done`} onClick={() => setDone(o.ev.id, o.date, true)}>✓</button>
                    <button onClick={() => startActivity({ eventId: o.ev.id, title: o.title, catId: o.catId, end: o.end })}>Start</button>
                  </li>
                ))}
              </ul>
              {doneToday > 0 && <p className="muted small done-count">✓ {doneToday} done today</p>}
            </section>
            <UpcomingMarks marks={marks} api={markApi} />
            <TasksPanel flashId={flashTask} cats={cats} onFocus={startActivity} onPlan={planTask} />
            <PomodoroPanel cats={cats} focusToday={focusToday} />
            <TimersPanel />
            <p className="muted small hint">/ search · n new · d/w/m/s views · ←/→ navigate · t today. Drag empty space to create, drag events to adjust a day, drag the bottom edge to resize.</p>
          </aside>
        </main>
      </div>

      {editor && (
        <EventDialog key={editor.draft.id} ev={editor.ev} draft={editor.draft} occDate={editor.date} cats={cats}
          onClose={() => setEditor(null)} onSave={save} onDelete={del} onResetDay={resetDay}
          done={!!editor.ev?.done?.includes(editor.date)}
          onToggleDone={async () => { if (editor.ev) await setDone(editor.ev.id, editor.date, !editor.ev.done?.includes(editor.date)); setEditor(null) }} />
      )}
      {markDlg && <MarkDialog key={markDlg.mark?.id ?? 'new' + markDlg.date} {...markDlg} cats={cats} onClose={() => setMarkDlg(null)} />}
      {searching && <Search events={events} tasks={tasks} marks={marks} cats={cats} onClose={() => setSearching(false)} onEvent={showEvent} onTask={showTask} onMark={showMark} />}
      <MarkPop pop={pop} color={markApi.color} />
      {dlg === 'cats' && <CategoriesDialog cats={cats} events={events} onClose={() => setDlg(null)} />}
      {dlg === 'install' && <InstallHelp onClose={() => setDlg(null)} />}
      {dlg === 'settings' && <SettingsDialog settings={settings} onClose={() => setDlg(null)} />}

      <div id="toasts" aria-live="polite">
        {toasts.map(t => (
          <div className="toast" key={t.id}>
            {t.msg}
            <div className="row">
              {t.action && <button className="primary" onClick={() => { t.action!.fn(); dismiss(t.id) }}>{t.action.label}</button>}
              <button onClick={() => dismiss(t.id)}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function App() {
  return <PomodoroProvider><Shell /></PomodoroProvider>
}
