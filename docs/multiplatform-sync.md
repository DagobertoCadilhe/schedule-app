# Schedule: using it on PC and phone with shared data

**Status:** plan agreed in principle on 2026-10-27. No code changed yet. Work continues next session.

## 1. Goal

Use Schedule on the **PC (web)** and on the **phone** (browser or installed PWA), with **one shared set of data**:
an event, task or log entry made on one device shows up on the other.

**Assumptions (decided):**
- **No offline use.** Devices are expected to be online and talk to the server.
- **Self-hosted** on a leftover PC running **Proxmox**. No third-party cloud.
- Single user, a few devices.

## 2. What the app already has

| Piece | Where | Status |
|---|---|---|
| React + TS + Vite front end | `src/` | ✅ Works in a phone browser |
| PWA (manifest, icons, service worker, install button) | `public/manifest.webmanifest`, `public/sw.js`, `src/pwa.ts` | ✅ Install and notifications need **HTTPS** |
| Browser working copy in IndexedDB (Dexie) | `src/db.ts` | ✅ |
| Node server + SQLite (`data/schedule.db`), hourly JSON backups | `server/index.mjs` | ⚠️ Only reachable from `localhost` |
| Sync between browsers | `src/sync.ts` ↔ `/api/rev`, `/api/data` | ⚠️ Whole-snapshot replace, 15 s polling |

Current sync (`src/sync.ts`): Dexie hooks call `markDirty()` on every change. About 700 ms later, `push()` sends a **full snapshot**
of all tables with `PUT /api/data`. The server **deletes all rows and rewrites them** (`writeAll`) and increments `rev`.
Other devices poll `/api/rev` every 15 s and, if it's newer, **replace** their whole local copy (`applyRemote`).

## 3. Problems to solve

| # | Problem | Fix |
|---|---|---|
| P1 | **Lost edits.** Device A sends its full snapshot without B's change from a few seconds ago, which deletes it. Happens even online, within the 15 s polling window. | Send **individual changes**, not snapshots (§5) |
| P2 | Other devices see changes up to 15 s late | **Live push** from the server (SSE) (§5) |
| P3 | Phone can't reach the server (`127.0.0.1` only; `trustedHost`/`trustedOrigin` allow only localhost) | Tailscale + allowed host from env (§4) |
| P4 | No HTTPS on a LAN IP, so no PWA install or notifications | Tailscale gives HTTPS (§4) |
| P5 | No login | Not needed: Tailscale means only your devices can reach it (§4) |
| P6 | Reminders can't alert when the app is closed | Optional Web Push worker (§6, broker option) |

## 4. Hosting: Proxmox LXC + Tailscale

```
Leftover PC (Proxmox VE)
 └─ LXC "schedule"  (Debian 12 · 1 vCPU · 512 MB–1 GB RAM · 8 GB disk)
     ├─ Node 20 + schedule-app  → systemd service, listens on 127.0.0.1:4173
     ├─ Tailscale               → https://schedule.<tailnet>.ts.net  (tailscale serve --bg 4173)
     └─ data/schedule.db        → Proxmox scheduled backups (vzdump) + app's hourly JSON copies

 Phone / PC (Tailscale app installed, same account) ──HTTPS──▶ schedule.<tailnet>.ts.net
```

- **LXC rather than a VM:** lighter, enough for one Node app.
- **Tailscale inside the container:** real HTTPS, reachable from home or on mobile data, no router port forwarding,
  no domain, no app login. The container needs TUN access. On the Proxmox host, add to `/etc/pve/lxc/<id>.conf`:
  ```
  lxc.cgroup2.devices.allow: c 10:200 rwm
  lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
  ```
- The Node server **keeps listening on 127.0.0.1**, because Tailscale connects to it locally.
- **Backups:** Proxmox scheduled backup of the container, nightly, ideally to a second disk or another machine.
- **Alternative:** Cloudflare Tunnel, for a public URL without the Tailscale app. That needs a domain plus
  a login (Cloudflare Access, or a password login added to the app).

## 5. Sync redesign: change messages + live push (fixes P1, P2)

Every save becomes a small **change message**:

```ts
type Change = { table: 'events'|'cats'|'activities'|'tasks'|'marks'|'kv'; id: string; op: 'upsert'|'delete'; data?: unknown; at: number; device: string }
```

**Client (`src/sync.ts`):**
- The Dexie `creating`/`updating`/`deleting` hooks record `{table, id, op}` in a pending queue, instead of only setting a dirty flag.
- `push()` sends the queued changes (`POST /api/changes`), with the current row read from Dexie for upserts.
- It listens to `GET /api/stream` (**Server-Sent Events**). Incoming changes from *other* devices are applied per record
  (`put` / `delete`) instead of clearing tables. Skip its own (`device` id), and set the existing `applying` flag so hooks don't echo.
- On start, or when the SSE connection reconnects, it does a full `GET /api/data` load, as now. The 15 s polling goes away.
- Bulk ops: `clearAllData()` / `importAll()` send one `op: 'reset'` message with the new full content, or a burst of changes.
- `fired` stays local-only, as today.

**Server (`server/index.mjs`):**
- `POST /api/changes`: in a transaction, for each change, `INSERT OR REPLACE` / `DELETE` that one row in `records`,
  bump `rev`, then **broadcast** the changes to all open SSE connections.
- `GET /api/stream`: keeps a list of connected clients and writes `data: {...}\n\n` on each change. Add a heartbeat every 30 s.
- `PUT /api/data` (full snapshot) stays only for import/reset and backups.
- `trustedHost` / `trustedOrigin`: also accept `process.env.ALLOWED_HOST` (e.g. `schedule.xxx.ts.net`).

Conflict rule: when two devices edit **the same record** at nearly the same moment, the last one to reach the server wins.
Edits to **different** records never erase each other. That's acceptable for a single user.

The `Change` format is deliberately the same as a broker message, so §6 can be added later without touching the client.

## 6. Option: microservices with a message broker (NATS)

A broker doesn't fix P1 by itself (whole snapshots would still overwrite each other). The fix is §5. It earns its place
once there are **several independent jobs reacting to the same changes**. On this Proxmox setup, that would look like:

```
Proxmox
 ├─ LXC "schedule-api"   Node server: HTTP + SSE, SQLite, publishes every Change to NATS
 ├─ LXC "nats"           NATS server (+ JetStream for durable streams) — one small binary
 ├─ LXC "notify-worker"  subscribes to events/marks changes, schedules reminders,
 │                       sends Web Push to the phone even when the app is closed (fixes P6)
 └─ LXC "backup-worker"  subscribes to all changes, writes an off-box copy / changelog
```

- Subjects: `schedule.change.<table>`, e.g. `schedule.change.events`. Payload: the `Change` from §5.
- Browsers still talk only to `schedule-api` (HTTP + SSE). NATS can also expose WebSockets if wanted later.
- Web Push needs: VAPID keys, a `push` handler in `public/sw.js`, a subscription endpoint, and the phone app installed
  (on iOS 16.4+, push only works for home-screen apps).

**Pros:** clean separation, each worker can fail or restart independently, good homelab learning project, makes P6 possible.
**Cons:** more containers, configs and failure points for a single-user app. Each extra service needs deploying,
monitoring and backups.

**Suggested order:** do §4 + §5 first (a working multi-device app). Then add NATS **together with** the
notification worker, the first service that genuinely needs to run independently.

## 7. Deployment files to add (`deploy/`)

- `schedule.service`: systemd unit (`node server/index.mjs`, `Environment=ALLOWED_HOST=…`, `Restart=always`).
- `setup-lxc.sh`: installs Node 20, build tools, Tailscale; clones the repo, `npm ci && npm run build`, enables the service,
  runs `tailscale serve --bg 4173`.
- `update.sh`: `git pull && npm ci && npm run build && systemctl restart schedule`.
- Later (option §6): `nats.service`, `notify-worker.service`, etc.

The Windows `.cmd` / `.ps1` scripts stay for running on the PC. The server doesn't use them.

## 8. Options considered and set aside

| Option | Why not (for now) |
|---|---|
| Tailscale to the main PC | Phone only syncs while the PC is on; the leftover PC + Proxmox solves that |
| PocketBase (hosted on PocketHost or local) | Bigger rewrite (server, sync, scripts), and the existing Node server already does the job |
| Full offline-first merge (tombstones, per-record timestamps) | Not needed: no offline use |
| Native mobile app | The PWA already covers phone use |

A PocketBase prototype was built and tested on 2026-10-27 in the separate `C:\Users\dagoberto.cadilhe\Documents\XD2`
folder (the early single-file version of the app). It's kept only as reference.

## 9. Next session checklist

1. Implement §5 (change messages + SSE) and test with two browsers editing at the same time.
2. Add `ALLOWED_HOST` support.
3. Write `deploy/` files (§7).
4. Proxmox: create the LXC, install Tailscale, deploy, open on the phone, install as PWA.
5. Decide whether to go ahead with the broker option (§6) and the Web Push notification worker.
