import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnce } from './lib/utils'

// Vite's own signal for a missing code file after a deploy: reload once instead of crashing.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
