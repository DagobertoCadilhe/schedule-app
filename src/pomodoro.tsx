import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useSettings } from './db'
import { notify, toast } from './toasts'
import { parseIso, toMin, uid, iso } from './util'
import type { Activity, StartSrc, Phase, PomoState, Settings } from './types'

export const PHASE_NAME: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

interface Ctx {
  state: PomoState
  remaining: number // seconds
  settings: Settings
  activity: Activity | undefined
  toggle: () => void
  skip: () => void
  reset: () => void
  startActivity: (src: StartSrc) => void
  stopActivity: () => void
}
const PomoCtx = createContext<Ctx>(null!)
export const usePomodoro = () => useContext(PomoCtx)

const phaseSec = (s: Settings, p: Phase) => s[p] * 60
const fresh = (s: Settings): PomoState => ({ phase: 'focus', running: false, endAt: 0, left: null, total: phaseSec(s, 'focus'), cycle: 0 })

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const [state, setState] = useState<PomoState | null>(null)
  const [now, setNow] = useState(Date.now())
  const stRef = useRef<PomoState | null>(null)
  const setRef = useRef(settings)
  setRef.current = settings
  const busy = useRef(false)

  const commit = useCallback((next: PomoState) => {
    stRef.current = next
    setState(next)
    db.kv.put({ key: 'pomo', value: next })
  }, [])

  useEffect(() => {
    db.kv.get('pomo').then(r => commit((r?.value as PomoState) ?? fresh(setRef.current)))
  }, [commit])

  const activity = useLiveQuery(
    () => (state?.activityId ? db.activities.get(state.activityId) : undefined),
    [state?.activityId],
  )

  const bankFocus = useCallback(async (s: PomoState, seconds: number) => {
    if (s.phase !== 'focus' || !s.activityId || seconds < 30) return
    await db.activities.where('id').equals(s.activityId).modify(a => { a.focusMin += Math.round(seconds / 60) })
  }, [])

  const endActivity = useCallback(async (id: string | undefined) => {
    if (id) await db.activities.where('id').equals(id).modify(a => { if (!a.endedAt) a.endedAt = Date.now() })
  }, [])

  const remainingOf = (s: PomoState) => s.running ? Math.max(0, Math.round((s.endAt - Date.now()) / 1000)) : (s.left ?? s.total)

  const advance = useCallback(async (completed: boolean) => {
    const s = stRef.current!, cfg = setRef.current
    const left = remainingOf(s)
    await bankFocus(s, completed ? s.total : s.total - left)
    let activityId = s.activityId
    const act = activityId ? await db.activities.get(activityId) : undefined
    const eventOver = !!act?.plannedEnd && Date.now() >= act.plannedEnd
    if (completed && eventOver) { await endActivity(activityId); activityId = undefined }

    const cycle = s.phase === 'focus' ? s.cycle + 1 : s.cycle
    const phase: Phase = s.phase === 'focus' ? (cycle % cfg.every === 0 ? 'long' : 'short') : 'focus'
    const total = phaseSec(cfg, phase)
    const auto = completed && cfg.autoStart && !eventOver
    commit({ phase, cycle, activityId, total, running: auto, endAt: auto ? Date.now() + total * 1000 : 0, left: null })
    if (completed) {
      notify(s.phase === 'focus' ? 'Focus session done' : 'Break over',
        eventOver ? 'Activity time is over' : `Next: ${PHASE_NAME[phase]}${auto ? '' : ' (press Start)'}`, cfg.sound)
    }
  }, [bankFocus, commit, endActivity])

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      const s = stRef.current
      if (s?.running && Date.now() >= s.endAt && !busy.current) {
        busy.current = true
        advance(true).finally(() => { busy.current = false })
      }
    }, 500)
    return () => clearInterval(t)
  }, [advance])

  // keep an idle, untouched timer in sync with duration settings
  useEffect(() => {
    const s = stRef.current
    if (s && !s.running && s.left === null && s.total !== phaseSec(settings, s.phase)) {
      commit({ ...s, total: phaseSec(settings, s.phase) })
    }
  }, [settings, commit])

  const value = useMemo<Ctx | null>(() => {
    if (!state) return null
    const remaining = remainingOf(state)
    return {
      state, remaining, settings, activity,
      toggle: () => {
        const s = stRef.current!
        if (s.running) commit({ ...s, running: false, left: remainingOf(s) })
        else {
          const left = s.left ?? s.total
          commit({ ...s, running: true, left: null, endAt: Date.now() + left * 1000 })
          if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
        }
      },
      skip: () => { advance(false) },
      reset: () => commit({ ...stRef.current!, running: false, left: null, total: phaseSec(setRef.current, stRef.current!.phase) }),
      startActivity: async (ev: StartSrc) => {
        const cfg = setRef.current, s = stRef.current!
        if (s.activityId) { await bankFocus(s, s.total - remainingOf(s)); await endActivity(s.activityId) }
        const day = parseIso(iso(new Date()))
        const plannedEnd = ev.end ? day.getTime() + toMin(ev.end) * 60000 : 0
        const capped = cfg.stopAtEventEnd && plannedEnd > Date.now()
        const secs = capped ? Math.max(60, Math.min(cfg.focus * 60, Math.round((plannedEnd - Date.now()) / 1000))) : cfg.focus * 60
        const a: Activity = {
          id: uid(), eventId: ev.eventId, title: ev.title, catId: ev.catId, startedAt: Date.now(),
          plannedEnd: plannedEnd > Date.now() ? plannedEnd : undefined, focusMin: 0,
        }
        await db.activities.add(a)
        commit({ ...s, phase: 'focus', total: secs, running: true, left: null, endAt: Date.now() + secs * 1000, activityId: a.id })
        toast(`Started "${ev.title}" at ${new Date().toTimeString().slice(0, 5)}`)
      },
      stopActivity: async () => {
        const s = stRef.current!
        if (s.activityId) { await bankFocus(s, s.total - remainingOf(s)); await endActivity(s.activityId) }
        commit({ ...s, activityId: undefined, running: false, left: null, total: phaseSec(setRef.current, s.phase) })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, now, settings, activity, advance, bankFocus, commit, endActivity])

  useEffect(() => {
    if (!value) return
    const m = String(Math.floor(value.remaining / 60)).padStart(2, '0'), s = String(value.remaining % 60).padStart(2, '0')
    document.title = value.state.running ? `${m}:${s} · ${PHASE_NAME[value.state.phase]}` : 'Schedule'
  }, [value])

  if (!value) return null
  return <PomoCtx.Provider value={value}>{children}</PomoCtx.Provider>
}
