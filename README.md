# Schedule

A personal weekly planner that runs on your own computer. Your data stays in a file on your machine, nothing is sent anywhere.

- **Week, day, month and stats views.** Drag to create, move and resize events.
- **A weekly plan you adjust as you go.** Change a single day without touching the plan, and mark things done for the day.
- **Tasks, date reminders and search.** Reminders show on hover and open details on click. Press `/` to search everything.
- **Timers.** Pomodoro, plus custom countdowns of any length.
- **Reminders and alerts** with sound and system notifications.
- **Installable as an app**, works offline, dark and light themes.

## Install

You need **[Node.js](https://nodejs.org) 20 or 22 (LTS)**. Nothing else.

### Windows (easiest)

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it, or run `git clone https://github.com/DagobertoCadilhe/schedule-app.git`.
2. Double-click **`schedule.cmd`**.

The first run installs and builds everything (about a minute), then opens Schedule in your browser at http://localhost:4173. After that, `schedule.cmd` opens it instantly.

### Mac / Linux, or from a terminal

```bash
git clone https://github.com/DagobertoCadilhe/schedule-app.git
cd schedule-app
npm install
npm start
```

Then open http://localhost:4173. (`.cmd` files are Windows-only; `npm start` works everywhere.)

## Everyday use

| I want to…                            | Do this                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| Open Schedule                         | Double-click `schedule.cmd`, or go to http://localhost:4173           |
| Have it ready every time I sign in    | Run `install-autostart.cmd` once (`uninstall-autostart.cmd` removes it) |
| Use it like a normal app              | In Chrome or Edge click **⬇ Install app** in the left bar              |
| Pick up a new version                 | Double-click `update.cmd`, then refresh the page (F5)                  |

With autostart on, the server starts hidden when you sign in, so you only open the browser or the installed app and your schedule is already there.

### Keyboard shortcuts

`/` search · `n` new event · `d` `w` `m` `s` day / week / month / stats · `←` `→` previous / next · `t` today

## Your data

- Everything is stored in **`data/schedule.db`** (a SQLite file) inside the Schedule folder.
- An automatic backup is written to `data/backups/` at most once an hour (the newest 48 are kept).
- The server only listens on your own computer (`127.0.0.1`) and rejects requests from other websites.
- The `data/` folder is excluded from git, so it is never uploaded.

**Back up or move your data:** open **Settings → Export backup**, then **Import backup** on the other computer.
**Start over:** **Settings → Clear all data** (this cannot be undone).

If you move or delete the Schedule folder, take `data/` with you.

## Troubleshooting

| Problem                                          | Fix                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| "Node.js is not installed"                       | Install the LTS version from https://nodejs.org, then run `schedule.cmd` again.           |
| The page won't load                              | The server isn't running. Double-click `schedule.cmd`.                                    |
| Left bar says **Server offline**                 | Same fix. Changes are kept in the browser and saved to the database once the server is back. |
| Port 4173 is already in use                      | Another program uses it. Stop it, or run with another port: `set PORT=4200` then `npm run serve`. |
| `npm install` fails on `better-sqlite3`          | Use Node 20 or 22 LTS. Newer versions may have no prebuilt file for your system.          |
| I changed the code and nothing changed           | Run `update.cmd` (or `npm run build`), then refresh with Ctrl+Shift+R.                    |
| No notifications                                 | Allow them in **Settings → Enable system notifications**, and in your browser's site settings. Alerts only play while Schedule is open in a tab or as the installed app. |

## Development

```bash
npm install
npm run dev      # front end with hot reload at http://localhost:5173
npm run serve    # the local server alone (database + API) at http://localhost:4173
npm run build    # type-check and build into dist/
npm start        # build, then run the server
```

The dev server on `:5173` forwards `/api` to the server on `:4173`, so run both while developing.

```
src/        React + TypeScript app (views, timers, reminders, sync)
server/     Node server: SQLite storage, API, serves the built app
public/     PWA manifest, service worker and icons
legacy/     the first single-file version
```

Built with React, TypeScript, Vite, Dexie (browser cache) and better-sqlite3.
