import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initSyncEngine } from './utils/syncManager.js'

initSyncEngine()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for offline app reopening support in production
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In dev mode, unregister any active service worker and clear stale caches
    // to prevent Vite HMR module graphs and React hook dispatchers from being corrupted
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then(() => {
          console.log('[SW] Unregistered development service worker')
        })
      }
    })
    if (typeof caches !== 'undefined') {
      caches.keys().then((names) => {
        names.forEach((name) => {
          console.log('[SW] Cleaning stale dev cache:', name)
          caches.delete(name)
        })
      })
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[SW] Service worker registered, scope:', reg.scope)
        })
        .catch((err) => {
          console.warn('[SW] Service worker registration failed:', err)
        })
    })
  }
}

