import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setConfirmer } from './data/actions'

// allowed-but-unusual entries (very large amounts, etc.) ask before saving
setConfirmer((m) => window.confirm(m))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
