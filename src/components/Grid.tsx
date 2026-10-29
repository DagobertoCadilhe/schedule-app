import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Activity, Category, Mark, Occ, PEvent } from '../types'
import type { MarkApi } from './Marks'
import { DAYS, HOUR_PX, clamp, fmtT, iso, markEnd, markWhen, nowMin, occsOn, toMin } from '../util'

interface Props {
  dates: Date[]
  events: PEvent[]
  cats: Category[]
  activities: Activity[]
  onCreate: (date: string, start: string, end: string) => void
  onOpen: (occ: Occ) => void
  onMove: (occ: Occ, toDate: string, start: string, end: string) => void
  marks: MarkApi
}

interface Drag {
  occ: Occ
  date: string
  s: number
  f: number
  mode: 'move' | 'resize'
  moved: boolean
  x0: number
  y0: number
  s0: number
  f0: number
}
interface Sel { date: string; a: number; b: number; moved: boolean }
type Entry = { s: number; f: number; dragging: boolean } & ({ occ: Occ; mark?: undefined } | { mark: Mark; occ?: undefined })
type Item = Entry & { lane: number; n: number }

const SNAP = 15
const snap = (m: number) => Math.round(m / SNAP) * SNAP

function lanes(items: Entry[]): Item[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.f - b.f)
  const out: Item[] = []
  let cluster: Item[] = [], end = -1
  const flush = () => { const n = Math.max(1, ...cluster.map(i => i.lane + 1)); cluster.forEach(i => { i.n = n }); cluster = [] }
  for (const it of sorted) {
    if (it.s >= end) { flush(); end = -1 }
    const item: Item = { ...it, lane: 0, n: 1 }
    const used = cluster.filter(c => c.f > item.s).map(c => c.lane)
    while (used.includes(item.lane)) item.lane++
    cluster.push(item); out.push(item); end = Math.max(end, item.f)
  }
  flush()
  return out
}

export function Grid({ dates, events, cats, activities, onCreate, onOpen, onMove, marks }: Props) {
  const colsRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [, setTick] = useState(0)
  const catMap = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])
  const today = iso(new Date())

  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (nowMin() / 60 - 2) * HOUR_PX)
  }, [])

  const begin = (e: React.PointerEvent, occ: Occ, mode: Drag['mode']) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const s = toMin(occ.start), f = toMin(occ.end)
    setDrag({ occ, date: occ.date, s, f, mode, moved: false, x0: e.clientX, y0: e.clientY, s0: s, f0: f })
  }

  const move = (e: React.PointerEvent) => {
    if (!drag || !colsRef.current) return
    const rect = colsRef.current.getBoundingClientRect()
    const idx = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * dates.length), 0, dates.length - 1)
    const dy = snap(((e.clientY - drag.y0) / HOUR_PX) * 60)
    let { s, f } = drag
    if (drag.mode === 'move') { s = clamp(drag.s0 + dy, 0, 24 * 60 - (drag.f0 - drag.s0)); f = s + (drag.f0 - drag.s0) }
    else { f = clamp(drag.f0 + dy, drag.s0 + SNAP, 24 * 60); s = drag.s0 }
    const date = drag.mode === 'move' ? iso(dates[idx]) : drag.occ.date
    const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5
    setDrag({ ...drag, s, f, date, moved })
  }

  const end = () => {
    if (!drag) return
    if (!drag.moved) onOpen(drag.occ)
    else if (drag.s !== drag.s0 || drag.f !== drag.f0 || drag.date !== drag.occ.date) onMove(drag.occ, drag.date, fmtT(drag.s), fmtT(drag.f))
    setDrag(null)
  }

  // drag across an empty column to create an event covering that range
  const minsAt = (e: React.PointerEvent) => clamp(snap(((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60), 0, 24 * 60)
  const selStart = (e: React.PointerEvent, date: string) => {
    if (e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const m = minsAt(e)
    setSel({ date, a: m, b: m, moved: false })
  }
  const selMove = (e: React.PointerEvent) => { if (sel) setSel({ ...sel, b: minsAt(e), moved: true }) }
  const selEnd = () => {
    if (!sel) return
    let s = Math.min(sel.a, sel.b), f = Math.max(sel.a, sel.b)
    if (!sel.moved || f - s < SNAP) { s = Math.floor(sel.a / 30) * 30; f = s + 60 }
    onCreate(sel.date, fmtT(clamp(s, 0, 24 * 60 - 15)), fmtT(clamp(f, 15, 24 * 60 - 1)))
    setSel(null)
  }

  const nowM = nowMin()

  /** A date reminder with a time shows in the grid like an event, but it is read-only (click to open). */
  const markBlock = (it: Item, m: Mark) => (
    <div
      key={'m' + m.id}
      className={'ev mkev' + (m.done ? ' done' : '')}
      style={{
        '--c': marks.color(m),
        top: it.s / 60 * HOUR_PX + 1, height: Math.max(22, (it.f - it.s) / 60 * HOUR_PX - 2),
        left: `calc(${it.lane / it.n * 100}% + 3px)`, width: `calc(${100 / it.n}% - 9px)`,
      } as CSSProperties}
      onMouseEnter={e => marks.hover([m], e.currentTarget)}
      onMouseLeave={() => marks.hover(null)}
      onClick={() => { marks.hover(null); marks.open(m) }}
    >
      <b>{m.done ? '✓' : '⚑'} {m.title}</b>
      <span>{markWhen(m)}</span>
    </div>
  )

  return (
    <div className="grid-scroll" ref={scrollRef}>
      <div className="grid-head">
        <div className="gutter-sp" />
        <div className="cols" style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
          {dates.map(d => (
            <div key={+d} className={'dh' + (iso(d) === today ? ' today' : '') + (marks.byDate.has(iso(d)) ? ' has-mark' : '')}>
              <span>{DAYS[d.getDay()]}</span><b>{d.getDate()}</b>
              {(marks.byDate.get(iso(d)) ?? []).map(m => (
                <button key={m.id} className={'mk' + (m.done ? ' done' : '') + (m.time ? ' timed' : '')} style={{ ['--m' as string]: marks.color(m) }}
                  onMouseEnter={e => marks.hover([m], e.currentTarget)} onMouseLeave={() => marks.hover(null)}
                  onClick={() => { marks.hover(null); marks.open(m) }}>{m.done ? '✓' : '⚑'} {m.time ? m.time + ' ' : ''}{m.title}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid-body">
        <div className="gutter">
          {Array.from({ length: 24 }, (_, h) => <div key={h}>{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</div>)}
        </div>
        <div className="cols" ref={colsRef} style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
          {dates.map(d => {
            const ds = iso(d)
            const base: Entry[] = occsOn(events, d)
              .filter(o => !(drag && drag.occ.ev.id === o.ev.id && drag.occ.date === ds))
              .map(occ => ({ occ, s: toMin(occ.start), f: toMin(occ.end), dragging: false }))
            if (drag && drag.date === ds) base.push({ occ: drag.occ, s: drag.s, f: drag.f, dragging: true })
            for (const m of marks.byDate.get(ds) ?? []) if (m.time) base.push({ mark: m, s: toMin(m.time), f: Math.max(toMin(m.time) + 30, toMin(markEnd(m))), dragging: false })
            const acts = activities.filter(a => iso(new Date(a.startedAt)) === ds)
            const selHere = sel && sel.date === ds && sel.moved ? sel : null
            return (
              <div
                key={ds}
                className={'col' + (ds === today ? ' today' : '')}
                style={{ height: 24 * HOUR_PX }}
                onPointerDown={e => selStart(e, ds)}
                onPointerMove={selMove}
                onPointerUp={selEnd}
                onPointerCancel={() => setSel(null)}
              >
                {selHere && (
                  <div className="selection" style={{ top: Math.min(selHere.a, selHere.b) / 60 * HOUR_PX, height: Math.abs(selHere.b - selHere.a) / 60 * HOUR_PX }}>
                    {fmtT(Math.min(selHere.a, selHere.b))}–{fmtT(Math.max(selHere.a, selHere.b))}
                  </div>
                )}
                {lanes(base).map(it => it.mark ? markBlock(it, it.mark) : (
                  <div
                    key={it.occ.ev.id + it.occ.date}
                    className={'ev' + (it.dragging ? ' dragging' : '') + (it.occ.adjusted ? ' adjusted' : '') + (it.occ.done ? ' done' : '')}
                    style={{
                      '--c': catMap.get(it.occ.catId)?.color ?? '#7a8194',
                      top: it.s / 60 * HOUR_PX + 1, height: Math.max(22, (it.f - it.s) / 60 * HOUR_PX - 2),
                      left: `calc(${it.lane / it.n * 100}% + 3px)`, width: `calc(${100 / it.n}% - 9px)`,
                    } as CSSProperties}
                    onPointerDown={e => begin(e, it.occ, 'move')}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <b>{it.occ.done ? '✓ ' : ''}{it.occ.title}</b>
                    <span>{fmtT(it.s)}–{fmtT(it.f)}{it.occ.adjusted && ' · adjusted'}</span>
                    <i className="resize" onPointerDown={e => begin(e, it.occ, 'resize')} />
                  </div>
                ))}
                {acts.map(a => {
                  const s = new Date(a.startedAt), eMs = a.endedAt ?? Date.now()
                  const sm = s.getHours() * 60 + s.getMinutes(), em = Math.max(sm + 2, sm + (eMs - a.startedAt) / 60000)
                  return (
                    <div key={a.id} className={'actual' + (a.endedAt ? '' : ' live')}
                      title={`Actually: ${a.title} ${fmtT(sm)}–${a.endedAt ? fmtT(Math.min(1439, Math.round(em))) : 'now'} · ${a.focusMin}m focus`}
                      style={{ top: sm / 60 * HOUR_PX, height: (em - sm) / 60 * HOUR_PX, background: catMap.get(a.catId)?.color }} />
                  )
                })}
                {ds === today && <div className="now" style={{ top: nowM / 60 * HOUR_PX }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
