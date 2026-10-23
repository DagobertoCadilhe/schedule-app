import { useSyncExternalStore } from 'react'
import { db } from './db'

/**
 * The browser keeps a fast working copy (IndexedDB); the local server keeps the permanent copy in a SQLite file.
 * Every change is pushed to the server, and a fresh browser loads the server's copy on start.
 */
const TABLES = ['events', 'cats', 'activities', 'tasks', 'marks'] as const

export interface SyncStatus { state: 'starting' | 'online' | 'offline'; rev: number; savedAt: number | null; pending: boolean }
let status: SyncStatus = { state: 'starting', rev: 0, savedAt: null, pending: false }
const subs = new Set<() => void>()
const setStatus = (p: Partial<SyncStatus>) => { status = { ...status, ...p }; subs.forEach(f => f()) }
export const useSyncStatus = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => status)

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

async function api<T>(path: string, init: RequestInit = {}, timeout = 4000): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(path, { ...init, signal: ctl.signal, headers: { 'X-Schedule': '1', 'Content-Type': 'application/json', ...init.headers } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json() as T
  } finally { clearTimeout(t) }
}

type Remote = { rev: number; kv?: { key: string; value: unknown }[] } & Record<(typeof TABLES)[number], unknown[]>

async function snapshot() {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) out[t] = await db.table(t).toArray()
  const settings = await db.kv.get('settings')
  out.kv = settings ? [settings] : []
  return out
}

let applying = false
let changeSeq = 0

async function applyRemote(r: Remote) {
  applying = true
  try {
    await db.transaction('rw', [...TABLES.map(t => db.table(t)), db.kv], async () => {
      for (const t of TABLES) { await db.table(t).clear(); if (r[t]?.length) await db.table(t).bulkAdd(r[t]) }
      await db.kv.delete('settings')
      for (const row of r.kv ?? []) await db.kv.put(row)
    })
  } finally { applying = false }
}

const isDirty = () => ls.get('rp.dirty') === '1'
const localRev = () => Number(ls.get('rp.rev') ?? 0)

let timer: ReturnType<typeof setTimeout> | undefined
let chain: Promise<void> = Promise.resolve()

function markDirty() {
  if (applying) return
  changeSeq++
  ls.set('rp.dirty', '1')
  setStatus({ pending: true })
  clearTimeout(timer)
  timer = setTimeout(() => { void push() }, 700)
}

/** Call after bulk operations (clear / import) that don't trigger table hooks. */
export const touch = markDirty

export function push(): Promise<void> {
  chain = chain.then(async () => {
    const seq = changeSeq
    try {
      const { rev } = await api<{ rev: number }>('/api/data', { method: 'PUT', body: JSON.stringify(await snapshot()) }, 15000)
      ls.set('rp.rev', String(rev))
      if (seq === changeSeq) { ls.del('rp.dirty'); setStatus({ pending: false }) }
      setStatus({ state: 'online', rev, savedAt: Date.now() })
    } catch { setStatus({ state: 'offline', pending: true }) }
  })
  return chain
}

/** Resolves once pending changes have reached the local database (used before page reloads). */
export async function flushSync() { clearTimeout(timer); if (isDirty()) await push() }

async function poll() {
  try {
    const { rev } = await api<{ rev: number }>('/api/rev', {}, 2500)
    if (status.state !== 'online') setStatus({ state: 'online' })
    if (isDirty()) { await push(); return }
    if (rev > localRev()) {
      await applyRemote(await api<Remote>('/api/data', {}, 15000))
      ls.set('rp.rev', String(rev))
      setStatus({ rev, savedAt: Date.now() })
    }
  } catch { setStatus({ state: 'offline' }) }
}

export async function initSync() {
  for (const t of TABLES) {
    const tbl = db.table(t)
    tbl.hook('creating', () => { markDirty() })
    tbl.hook('updating', () => { markDirty() })
    tbl.hook('deleting', () => { markDirty() })
  }
  db.kv.hook('creating', pk => { if (pk === 'settings') markDirty() })
  db.kv.hook('updating', (_m, pk) => { if (pk === 'settings') markDirty() })

  try {
    const remote = await api<Remote>('/api/data', {}, 2500)
    const localCount = (await Promise.all(TABLES.filter(t => t !== 'cats').map(t => db.table(t).count()))).reduce((a, b) => a + b, 0)
    if (remote.rev === 0) {
      // the database file is new: seed it with whatever this browser already holds
      ls.set('rp.dirty', '1'); await push()
    } else if (isDirty()) {
      await push() // unsynced edits made here are the freshest
    } else if (remote.rev > localRev()) {
      if (localRev() === 0 && localCount > 0) {
        // this browser has its own, never-synced data: keep a copy on the server before replacing it
        await api('/api/stash', { method: 'POST', body: JSON.stringify(await snapshot()) }).catch(() => undefined)
      }
      await applyRemote(remote)
      ls.set('rp.rev', String(remote.rev))
      setStatus({ state: 'online', rev: remote.rev, savedAt: Date.now() })
    } else setStatus({ state: 'online', rev: remote.rev, savedAt: Date.now() })
  } catch { setStatus({ state: 'offline', pending: isDirty() }) }

  setInterval(poll, 15000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void poll() })
  window.addEventListener('pagehide', () => {
    if (!isDirty()) return
    // best effort: last-moment save while the tab closes
    void snapshot().then(s => fetch('/api/data', { method: 'PUT', keepalive: true, headers: { 'X-Schedule': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(s) }))
  })
}
