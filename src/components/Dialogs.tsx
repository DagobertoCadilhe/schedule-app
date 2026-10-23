import { useEffect, useRef, useState, type ReactNode } from 'react'
import { db, exportAll, importAll, patchSettings, loadSampleWeek, clearAllData } from '../db'
import { toast } from '../toasts'
import { flushSync, touch, useSyncStatus } from '../sync'
import { uid } from '../util'
import type { Category, Settings } from '../types'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current?.close() }}>
      <header className="dlg-head">
        <h3>{title}</h3>
        <button type="button" className="x" aria-label="Close" onClick={() => ref.current?.close()}>✕</button>
      </header>
      <div className="dlg-body">{children}</div>
      <footer className="dlg-foot"><span className="spacer" /><button className="primary" onClick={() => ref.current?.close()}>Done</button></footer>
    </dialog>
  )
}

export function CategoriesDialog({ cats, events, onClose }: { cats: Category[]; events: { catId: string }[]; onClose: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#5b7cfa')
  const used = (id: string) => events.some(e => e.catId === id)
  return (
    <Modal title="Categories" onClose={onClose}>
      {cats.map(c => (
        <div className="catrow" key={c.id}>
          <input type="color" value={c.color} onChange={e => db.cats.update(c.id, { color: e.target.value })} />
          <input defaultValue={c.name} onBlur={e => e.target.value.trim() && db.cats.update(c.id, { name: e.target.value.trim() })} />
          <button className="danger" disabled={cats.length === 1 || used(c.id)}
            title={used(c.id) ? 'Still used by events' : 'Delete'} onClick={() => db.cats.delete(c.id)}>✕</button>
        </div>
      ))}
      <div className="catrow">
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        <input placeholder="New category" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={() => { if (name.trim()) { db.cats.add({ id: uid(), name: name.trim(), color }); setName('') } }}>Add</button>
      </div>
    </Modal>
  )
}

export function SettingsDialog({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const perm = 'Notification' in window ? Notification.permission : 'unsupported'
  const check = (k: 'autoStart' | 'stopAtEventEnd' | 'sound', label: string) => (
    <label className="check"><input type="checkbox" checked={settings[k]} onChange={e => patchSettings({ [k]: e.target.checked })} />{label}</label>
  )
  return (
    <Modal title="Settings" onClose={onClose}>
      <label>Theme
        <select value={settings.theme} onChange={e => patchSettings({ theme: e.target.value as Settings['theme'] })}>
          <option value="dark">Dark</option><option value="light">Light</option><option value="auto">Match system</option>
        </select>
      </label>
      {check('autoStart', 'Auto-start the next Pomodoro phase')}
      {check('stopAtEventEnd', 'Cut the focus timer at the event’s planned end')}
      {check('sound', 'Play a sound with alerts')}
      <div className="row">
        <button onClick={() => Notification.requestPermission().then(() => toast('Notification permission updated'))}
          disabled={perm !== 'default'}>
          {perm === 'granted' ? 'System notifications on' : perm === 'denied' ? 'Notifications blocked in browser' : 'Enable system notifications'}
        </button>
      </div>
      <StorageInfo />
      <h4>Backups and sample data</h4>
      <div className="row">
        <button onClick={exportAll}>Export backup</button>
        <button onClick={() => fileRef.current?.click()}>Import backup</button>
        <button onClick={async () => { await loadSampleWeek(); touch(); toast('Sample week added') }}>Load sample week</button>
        <button className="danger" onClick={async () => {
          if (!confirm('Delete ALL events, tasks, date reminders and history? This cannot be undone. Tip: export a backup first.')) return
          await clearAllData(); touch(); await flushSync(); location.reload()
        }}>Clear all data</button>
        <input ref={fileRef} type="file" accept="application/json" hidden
          onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return
            try { await importAll(f); touch(); toast('Backup imported') } catch (err) { toast(`Import failed: ${(err as Error).message}`) }
            e.target.value = ''
          }} />
      </div>
    </Modal>
  )
}

export function InstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Install Schedule" onClose={onClose}>
      <p>Installing gives the planner its own window and taskbar icon, and lets it open offline.</p>
      <h4>Chrome or Edge</h4>
      <p>Click the <b>install icon</b> at the right end of the address bar, or open the browser menu (⋮) and choose <b>Install Schedule</b> / <b>Apps → Install this site as an app</b>.</p>
      <h4>Not seeing it?</h4>
      <p>The browser only offers installation on the production build (<code>npm start</code>, address <code>localhost:4173</code>), and not if it is already installed.</p>
      <h4>Your data</h4>
      <p>The installed app keeps its own copy. Use <b>Settings → Export backup</b> and then <b>Import backup</b> to move data between addresses.</p>
    </Modal>
  )
}

function StorageInfo() {
  const st = useSyncStatus()
  const ok = st.state === 'online' && !st.pending
  return (
    <>
      <h4>Where your data lives</h4>
      <div className={'storage ' + (ok ? 'ok' : 'warn')}>
        <span className="dot" />
        <div>
          <b>{st.state === 'online' ? (st.pending ? 'Saving to the local database…' : 'Saved to the local database') : st.state === 'starting' ? 'Connecting…' : 'Local database not reachable'}</b>
          <p className="small muted">
            {st.state === 'offline'
              ? 'Changes are kept in this browser and will be saved to the database as soon as the Schedule server is running again (run schedule.cmd).'
              : 'Stored in the file data/schedule.db in the Schedule folder, with automatic hourly backups in data/backups.'}
          </p>
        </div>
      </div>
    </>
  )
}
