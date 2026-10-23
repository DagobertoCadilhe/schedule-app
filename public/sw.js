// Offline support: the app shell is cached after the first visit; user data lives in IndexedDB, not here.
const CACHE = 'schedule-v2'
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  // pages: network first (so updates arrive), cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { caches.open(CACHE).then(c => c.put('./', res.clone())); return res })
        .catch(() => caches.match('./')),
    )
    return
  }
  // assets: serve from cache immediately, refresh in the background
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()))
        return res
      }).catch(() => hit)
      return hit || net
    }),
  )
})
