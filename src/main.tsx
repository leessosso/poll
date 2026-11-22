import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pollTitle } from './lib/org-config.ts'

document.title = pollTitle

const legacyHash = window.location.hash.match(/^#(\/.*)$/)
if (legacyHash) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  window.history.replaceState(null, '', `${base}${legacyHash[1]}${window.location.search}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
