// Rutas en el hash de la URL, al estilo de n8n (/workflow/:id). Funciona en GitHub Pages sin
// configuración de servidor, y al recargar o usar atrás/adelante se vuelve a la misma vista.
import { useEffect, useState } from 'react'

export type Route =
  | { view: 'home' }
  | { view: 'executions' }
  | { view: 'flow'; id: string; tab: 'editor' | 'executions' }
  | { view: 'none' }

export function parseRoute(hash = location.hash): Route {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (!p.length) return hash.startsWith('#/') ? { view: 'home' } : { view: 'none' }
  if (p[0] === 'ejecuciones') return { view: 'executions' }
  if (p[0] === 'flujo' && p[1]) return { view: 'flow', id: decodeURIComponent(p[1]), tab: p[2] === 'ejecuciones' ? 'executions' : 'editor' }
  return { view: 'home' }
}

export function routeHash(r: Route): string {
  switch (r.view) {
    case 'home': return '#/'
    case 'executions': return '#/ejecuciones'
    case 'flow': return `#/flujo/${encodeURIComponent(r.id)}${r.tab === 'executions' ? '/ejecuciones' : ''}`
    default: return ''
  }
}

/** Navega a una ruta. Con replace no crea una entrada nueva en el historial del navegador. */
export function go(r: Route, replace = false) {
  const h = routeHash(r)
  if (location.hash === h) return
  if (replace) {
    history.replaceState(null, '', location.pathname + location.search + h)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else location.hash = h
}

export function useRoute(): Route {
  const [r, setR] = useState(parseRoute)
  useEffect(() => {
    const f = () => setR(parseRoute())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}
