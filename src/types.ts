export type Repeat = 'none' | 'daily' | 'weekdays' | 'custom'
export type Phase = 'focus' | 'short' | 'long'

export interface Category { id: string; name: string; color: string }

export interface Override { title?: string; catId?: string; start?: string; end?: string }

export interface PEvent {
  id: string
  title: string
  catId: string
  start: string // HH:MM
  end: string
  repeat: Repeat
  days: number[] // 0=Sun, used when repeat === 'custom'
  date: string // YYYY-MM-DD: the date for 'none', optional start date otherwise
  remind: number // minutes before start, -1 = none
  skip: string[] // dates where a recurring event is skipped
  over?: Record<string, Override> // per-day adjustments to the weekly plan
  done?: string[] // dates on which this event was marked done
  notes: string
}

export interface Activity {
  id: string
  eventId?: string
  title: string
  catId: string
  startedAt: number
  endedAt?: number
  plannedEnd?: number
  focusMin: number
}

export interface Settings {
  focus: number
  short: number
  long: number
  every: number
  autoStart: boolean
  stopAtEventEnd: boolean
  sound: boolean
  theme: 'dark' | 'light' | 'auto'
}

export interface PomoState {
  phase: Phase
  running: boolean
  endAt: number
  left: number | null // seconds remaining while paused; null = full length
  total: number // seconds planned for the current run
  cycle: number
  activityId?: string
}

export const DEFAULT_SETTINGS: Settings = {
  focus: 25, short: 5, long: 15, every: 4,
  autoStart: false, stopAtEventEnd: true, sound: true, theme: 'dark',
}

export interface Task {
  id: string
  title: string
  catId: string
  done: boolean
  due: string // YYYY-MM-DD or ''
  created: number
  doneAt?: number
}

/** One event as it appears on a specific date, with that day's adjustments applied. */
export interface Occ {
  ev: PEvent
  date: string
  title: string
  catId: string
  start: string
  end: string
  adjusted: boolean
  done: boolean
}

export interface StartSrc { eventId?: string; title: string; catId: string; end?: string }

/** A reminder tied to a calendar date (deadline, birthday, trip…), highlighted on the calendar. */
export interface Mark {
  id: string
  date: string // YYYY-MM-DD
  title: string
  description: string
  catId: string
  notify: number // alert from N days before the date; -1 = no alert
  time?: string // HH:MM start; missing = all-day
  endTime?: string // optional HH:MM end (timed only)
  remindMin?: number // timed only: minutes before `time` to alert on the day; -1 = none (default 15)
  done?: boolean // marked as done: shown struck through, no more alerts
}

/** A countdown timer of any length the user picks. */
export interface TimerItem {
  id: string
  label: string
  total: number // seconds
  state: 'idle' | 'running' | 'paused' | 'done'
  endAt: number // ms timestamp, meaningful while running
  left: number | null // seconds remaining while paused
}
