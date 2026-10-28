// Local server for Schedule: serves the built app and stores all data in a SQLite file on this machine.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const dataDir = process.env.SCHEDULE_DATA || path.join(root, 'data')
const backupDir = path.join(dataDir, 'backups')
const PORT = Number(process.env.PORT || 4173)
const HOST = '127.0.0.1' // only this computer can reach it
fs.mkdirSync(backupDir, { recursive: true })

const db = new Database(path.join(dataDir, 'schedule.db'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS records (tbl TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (tbl, id));
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`)
const TABLES = ['events', 'cats', 'activities', 'tasks', 'marks', 'kv']

const getRev = () => Number(db.prepare("SELECT value FROM meta WHERE key='rev'").pluck().get() ?? 0)
const readAll = () => {
  const out = Object.fromEntries(TABLES.map(t => [t, []]))
  for (const r of db.prepare('SELECT tbl, json FROM records').all()) if (out[r.tbl]) out[r.tbl].push(JSON.parse(r.json))
  return out
}
const idOf = (tbl, row) => String(tbl === 'kv' ? row.key : row.id)

const insert = db.prepare('INSERT OR REPLACE INTO records (tbl, id, json) VALUES (?, ?, ?)')
const writeAll = db.transaction(data => {
  db.prepare('DELETE FROM records').run()
  for (const t of TABLES) for (const row of data[t] ?? []) insert.run(t, idOf(t, row), JSON.stringify(row))
  const rev = getRev() + 1
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('rev', ?)").run(String(rev))
  return rev
})

/** Keeps a JSON copy of the previous state, at most one per hour, newest 48 kept. */
function backupBeforeWrite() {
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort()
  const last = files.at(-1)
  if (last && Date.now() - fs.statSync(path.join(backupDir, last)).mtimeMs < 3600_000) return
  if (getRev() === 0) return
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  fs.writeFileSync(path.join(backupDir, `schedule-${stamp}.json`), JSON.stringify({ rev: getRev(), ...readAll() }))
  for (const f of files.slice(0, Math.max(0, files.length + 1 - 48))) fs.unlinkSync(path.join(backupDir, f))
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

const trustedHost = h => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h ?? '')
const trustedOrigin = o => !o || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)

function body(req, limit = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function api(req, res, url) {
  // Block other websites (and DNS-rebinding tricks) from reading or writing your data.
  if (!trustedHost(req.headers.host) || !trustedOrigin(req.headers.origin) || req.headers['x-schedule'] !== '1') return send(res, 403, { error: 'forbidden' })
  if (url.pathname === '/api/rev' && req.method === 'GET') return send(res, 200, { rev: getRev() })
  if (url.pathname === '/api/data' && req.method === 'GET') return send(res, 200, { rev: getRev(), ...readAll() })
  if (url.pathname === '/api/data' && req.method === 'PUT') {
    let data
    try { data = JSON.parse(await body(req)) } catch { return send(res, 400, { error: 'invalid JSON' }) }
    if (!data || typeof data !== 'object' || TABLES.some(t => data[t] !== undefined && !Array.isArray(data[t]))) return send(res, 400, { error: 'invalid data' })
    backupBeforeWrite()
    return send(res, 200, { rev: writeAll(data) })
  }
  if (url.pathname === '/api/stash' && req.method === 'POST') {
    // a browser that held its own unsynced data keeps a copy here before the shared data replaces it
    const text = await body(req)
    JSON.parse(text)
    fs.writeFileSync(path.join(backupDir, `stash-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.json`), text)
    return send(res, 200, { ok: true })
  }
  if (url.pathname === '/api/ics' && req.method === 'POST') {
    // fetches a calendar feed (e.g. Canvas) for the app, since the browser can't read other sites directly
    let feed
    try { feed = new URL(String(JSON.parse(await body(req, 4096)).url).trim().replace(/^webcals?:/i, 'https:')) } catch { return send(res, 400, { error: 'invalid feed link' }) }
    if (feed.protocol !== 'https:') return send(res, 400, { error: 'the feed link must start with https://' })
    let r
    try { r = await fetch(feed, { signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar' } }) } catch { return send(res, 502, { error: 'could not reach the feed' }) }
    if (!r.ok) return send(res, 502, { error: `the feed answered ${r.status}` })
    const text = await r.text()
    if (text.length > 20 * 1024 * 1024) return send(res, 502, { error: 'the feed is too large' })
    if (!/BEGIN:VCALENDAR/.test(text)) return send(res, 502, { error: 'that link is not a calendar feed' })
    return send(res, 200, { text })
  }
  return send(res, 404, { error: 'not found' })
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel.endsWith('/')) rel += 'index.html'
  let file = path.normalize(path.join(dist, rel))
  if (!file.startsWith(dist)) return send(res, 403, 'Forbidden', 'text/plain')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  if (!fs.existsSync(file)) return send(res, 503, 'The app is not built yet. Run: npm run build', 'text/plain')
  const ext = path.extname(file)
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(file).pipe(res)
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const run = url.pathname.startsWith('/api/') ? api(req, res, url) : Promise.resolve(serveStatic(req, res, url))
  run.catch(err => { console.error(err); if (!res.headersSent) send(res, 500, { error: 'server error' }) })
}).on('error', err => {
  if (err.code === 'EADDRINUSE') { console.log(`Schedule is already running on http://localhost:${PORT}`); process.exit(0) }
  throw err
}).listen(PORT, HOST, () => {
  console.log(`Schedule running at http://localhost:${PORT}`)
  console.log(`Data file: ${path.join(dataDir, 'schedule.db')}`)
})
