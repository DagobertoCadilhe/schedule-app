import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { registerSW } from './pwa'
import { initSync } from './sync'

registerSW()

// load the saved data from the local database first, so the page opens already filled in
initSync().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
})
