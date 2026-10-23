# Schedule

React + TypeScript + Vite front end, with a small local Node server that keeps all data in a SQLite file.

## Everyday use

Double-click **`schedule.cmd`**. It starts the server (hidden) if needed and opens http://localhost:4173.

To have the server start automatically when you sign in to Windows, run **`install-autostart.cmd`** once
(`uninstall-autostart.cmd` removes it). After that you only open the browser, or the installed Schedule app.

## Where the data is

- `data/schedule.db` is the permanent copy (SQLite).
- `data/backups/` has an automatic JSON copy at most once an hour (newest 48 kept).
- The browser keeps a fast working copy and syncs every change to the database, so any browser that opens
  http://localhost:4173 shows the same data. If the server is off, changes are kept in the browser and saved later.
- The server only listens on this computer (127.0.0.1) and rejects requests from other websites.

## Development

```
npm install
npm run dev      # front end with hot reload on :5173 (proxies /api to the server on :4173)
npm run serve    # the local server alone
npm start        # build, then run the server
```

The first version (single HTML file) is kept in `legacy/v1.html`.
