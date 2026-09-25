import type { ReactNode } from 'react'
import type { Color } from '../engine/catalog'

/** Color CSS de un token de Codara (o de tipo de dato). */
export const cssColor = (c: Color | string) => c === 'muted' ? 'rgb(var(--c-muted))' : `rgb(var(--c-${c}))`

export function typeColor(t = ''): string {
  const s = t.toLowerCase()
  return s === 'string' ? 'tstr' : s === 'json' ? 'tjson' : s === 'number' || s === 'bignumber' ? 'tnum' : s === 'html' ? 'muted' : 'tbuf'
}

/** Etiqueta con el patrón de Codara: texto de color, fondo al 10 % y borde al 40 %. */
export function Tag({ color, children, className = '' }: { color: string; children: ReactNode; className?: string }) {
  const c = cssColor(color)
  return (
    <span className={`tag ${className}`} style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      {children}
    </span>
  )
}

export const TypeTag = ({ type }: { type?: string }) => <Tag color={typeColor(type)}>{type}</Tag>

export const Square = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span className="inline-block shrink-0" style={{ width: size, height: size, background: cssColor(color) }} aria-hidden="true" />
)
