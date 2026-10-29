import { useEffect, useRef } from 'react'
import { db } from './db'
import { notify, toast } from './toasts'
import { daysUntil, iso, markEnd, nowMin, occsOn, toMin } from './util'
import type { Mark, PEvent, Settings, StartSrc } from './types'

/** Fires a toast + sound + system notification once per event occurrence, at (start - remind). */
export function useReminders(events: PEvent[] | undefined, marks: Mark[] | undefined, settings: Settings, onStart: (src: StartSrc) => void, onOpenMark: (m: Mark) => void) {
  const ref = useRef({ events, marks, settings, onStart, onOpenMark })
  ref.current = { events, marks, settings, onStart, onOpenMark }

  useEffect(() => {
    const seen = new Set<string>()
    const run = async () => {
      const { events: list, marks: dates, settings: cfg, onStart: start, onOpenMark } = ref.current
      if (!list) return
      const n = new Date(), m = nowMin(), ds = iso(n)
      for (const o of occsOn(list, n)) {
        const e = { ...o, remind: o.ev.remind }
        if (e.remind < 0 || o.done) continue
        const key = o.ev.id + ds
        if (seen.has(key)) continue
        if (m >= toMin(e.start) - e.remind && m < toMin(e.end)) {
          seen.add(key)
          if (await db.fired.get(key)) continue
          await db.fired.put({ key, at: Date.now() })
          const left = toMin(e.start) - m
          const body = left > 0 ? `starts in ${left} min (${e.start})` : `started at ${e.start}`
          notify(e.title, body, cfg.sound)
          toast(`${e.title} — ${body}`, { ms: 60000, action: { label: 'Start now', fn: () => start({ eventId: o.ev.id, title: o.title, catId: o.catId, end: o.end }) } })
        }
      }
      // date reminders: alert once a day (after 08:00) from `notify` days before the date until the day itself
      for (const mk of (dates ?? [])) {
        if (mk.done) continue
        // timed reminders also alert on the day itself, shortly before their time
        const lead = mk.remindMin ?? 15
        if (mk.time && mk.date === ds && lead >= 0) {
          const key2 = `markt:${mk.id}:${ds}`
          if (!seen.has(key2) && m >= toMin(mk.time) - lead && m < toMin(markEnd(mk))) {
            seen.add(key2)
            if (!(await db.fired.get(key2))) {
              await db.fired.put({ key: key2, at: Date.now() })
              const away = toMin(mk.time) - m
              const body = away > 0 ? `starts in ${away} min (${mk.time})` : `started at ${mk.time}`
              notify(mk.title, body, cfg.sound)
              toast(`⚑ ${mk.title} — ${body}`, { ms: 60000, action: { label: 'Details', fn: () => onOpenMark(mk) } })
            }
          }
        }
        const left = daysUntil(mk.date)
        if (mk.notify < 0 || left < 0 || left > mk.notify || m < 8 * 60) continue
        if (mk.time && left === 0 && lead >= 0) continue // the timed alert above covers the day itself
        const key = `mark:${mk.id}:${ds}`
        if (seen.has(key)) continue
        seen.add(key)
        if (await db.fired.get(key)) continue
        await db.fired.put({ key, at: Date.now() })
        const when = (left === 0 ? 'is today' : left === 1 ? 'is tomorrow' : `is in ${left} days`) + (mk.time ? ` at ${mk.time}` : '')
        notify(mk.title, when, cfg.sound)
        toast(`${mk.title} ${when}`, { ms: 60000, action: { label: 'Details', fn: () => onOpenMark(mk) } })
      }
      await db.fired.where('at').below(Date.now() - 3 * 864e5).delete()
    }
    run()
    const t = setInterval(run, 5000)
    return () => clearInterval(t)
  }, [])
}
