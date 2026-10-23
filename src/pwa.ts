import { useEffect, useState } from 'react'

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// The service worker is only registered in production builds, so the dev server never serves stale files.
export function registerSW() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline support is optional */ })
    })
  }
}

export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** Returns install() (native prompt when the browser offers one, otherwise null). */
export function useInstall(): (() => void) | null {
  const [ev, setEv] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent) }
    const onInstalled = () => setEv(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  return ev ? () => { ev.prompt(); ev.userChoice.then(() => setEv(null)) } : null
}
