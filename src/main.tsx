import '@fontsource-variable/literata/standard.css'
import '@fontsource-variable/literata/standard-italic.css'
import '@fontsource-variable/figtree'
import '@fontsource/ibm-plex-mono/400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { loadLibrary } from './lib/library'
import { handleWebCallback } from './lib/spotify'

await Promise.all([loadLibrary(), handleWebCallback()])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
