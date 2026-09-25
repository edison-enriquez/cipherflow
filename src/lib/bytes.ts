// Utilidades de bytes y codificaciones usadas por la interfaz y las explicaciones.
const te = new TextEncoder()
const td = new TextDecoder('utf-8')

export const utf8 = (s: string) => te.encode(s)
export const fromUtf8 = (b: Uint8Array) => td.decode(b)
export const hx = (x: number) => x.toString(16).padStart(2, '0')
export const toHex = (b: Uint8Array, sep = '') => Array.from(b, hx).join(sep)
export const bin8 = (x: number) => x.toString(2).padStart(8, '0')
export const w32 = (x: number) => (x >>> 0).toString(16).padStart(8, '0')

export function fromHex(s: string): Uint8Array {
  s = String(s).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '')
  if (s.length % 2) s = '0' + s
  const o = new Uint8Array(s.length / 2)
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16)
  return o
}

export function toB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(s: string): Uint8Array {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const o = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i)
  return o
}

export const latin1 = (s: string) => Uint8Array.from(String(s), c => c.charCodeAt(0) & 255)

export function isPrintable(b: Uint8Array): boolean {
  if (!b.length) return true
  let s: string
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(b) } catch { return false }
  return !/[\x00-\x08\x0E-\x1F\x7F]/.test(s)
}

export const fmtSize = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'

export function entropy(b: Uint8Array): number {
  if (!b.length) return 0
  const f = new Array(256).fill(0)
  for (const x of b) f[x]++
  let h = 0
  for (const c of f) if (c) { const q = c / b.length; h -= q * Math.log2(q) }
  return h
}

export const chShow = (x: number) => x >= 33 && x < 127 ? String.fromCharCode(x) : x === 32 ? '␠' : '·'

/** Convierte un argumento toggleString de CyberChef ({string, option}) en bytes. */
export function toggleBytes(str: string, opt: string): Uint8Array {
  str = String(str || '')
  switch (String(opt || '').toLowerCase()) {
    case 'hex': return fromHex(str)
    case 'base64': return fromB64(str)
    case 'utf8': return utf8(str)
    case 'decimal': return Uint8Array.from(str.split(/[^0-9]+/).filter(Boolean).map(Number))
    case 'binary': {
      const s = str.replace(/[^01]/g, '')
      return Uint8Array.from({ length: Math.floor(s.length / 8) }, (_, i) => parseInt(s.substr(i * 8, 8), 2))
    }
    default: return latin1(str)
  }
}

export function hexdump(b: Uint8Array, max = 4096): string {
  const lines: string[] = []
  const n = Math.min(b.length, max)
  for (let o = 0; o < n; o += 16) {
    const row = b.subarray(o, Math.min(o + 16, n))
    let hs = ''
    for (let i = 0; i < 16; i++) hs += (i < row.length ? hx(row[i]) : '  ') + (i === 7 ? '  ' : ' ')
    lines.push(o.toString(16).padStart(8, '0') + '  ' + hs + ' |' + Array.from(row, x => x >= 32 && x < 127 ? String.fromCharCode(x) : '.').join('') + '|')
  }
  return lines.join('\n') + (b.length > max ? `\n… ${fmtSize(b.length - max)} más` : '')
}

/** Vista automática: texto si es legible, volcado hexadecimal si no. */
export function autoText(b: Uint8Array, limit = 200000): string {
  return isPrintable(b.subarray(0, 4000)) ? fromUtf8(b.subarray(0, limit)) : hexdump(b)
}

export function stripTags(s: string): string {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function sanitizeHTML(html: string): string {
  const d = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html')
  d.querySelectorAll('script,iframe,object,embed,link,style,meta,form').forEach(e => e.remove())
  d.querySelectorAll('*').forEach(e => {
    for (const a of [...e.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name)
    }
    if (e.tagName === 'A') { e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer') }
  })
  return (d.body.firstChild as HTMLElement).innerHTML
}

/** Expande rangos de alfabeto al estilo de CyberChef ("A-Za-z0-9+/="). */
export function expandAlphabet(s: string): string {
  const o: string[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '-') { o.push('-'); i++ }
    else if (i < s.length - 2 && s[i + 1] === '-') {
      const a = s.charCodeAt(i), b = s.charCodeAt(i + 2)
      for (let c = a; c <= b; c++) o.push(String.fromCharCode(c))
      i += 2
    } else o.push(s[i])
  }
  return o.join('')
}
