import { useSyncExternalStore } from 'react'

export interface Toast { id: number; msg: string; action?: { label: string; fn: () => void } }
let list: Toast[] = []
let nextId = 1
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

export function dismiss(id: number) { list = list.filter(t => t.id !== id); emit() }
export function toast(msg: string, opt: { ms?: number; action?: Toast['action'] } = {}) {
  const t: Toast = { id: nextId++, msg, action: opt.action }
  list = [...list, t]; emit()
  setTimeout(() => dismiss(t.id), opt.ms ?? 6000)
}
export const useToasts = () =>
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => list)

let audio: AudioContext | undefined
export function beep() {
  try {
    audio = audio ?? new AudioContext()
    const ctx = audio
    for (const t of [0, 0.25]) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880; g.gain.value = 0.15
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18)
    }
  } catch { /* audio not available */ }
}

export function notify(title: string, body: string, sound: boolean) {
  if (sound) beep()
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }) } catch { /* ignore */ }
  }
}
