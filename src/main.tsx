import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setConfirmer } from './data/actions'
import { watchForUpdates } from './lib/updates'

// allowed-but-unusual entries (very large amounts, etc.) ask before saving
setConfirmer((m) => window.confirm(m))
// reload into a new version after a deploy, instead of failing on files that no longer exist
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
