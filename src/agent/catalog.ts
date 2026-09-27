// Catálogo de operaciones visto por el agente: qué existe, qué parámetros tiene y qué valores
// admiten. Es la «verdad» contra la que se valida lo que proponga el modelo.
// La interfaz Catalog permite probar el agente sin cargar el motor de CyberChef.

export interface ArgInfo {
  name: string
  type: string
  /** Valores permitidos (desplegables) o formatos del campo (toggleString). */
  options?: string[]
  /** Presets sugeridos para campos editables. */
  presets?: string[]
  default?: unknown
}
export interface OpLite { name: string; category: string; description: string; inputs: number; inType?: string; outType?: string; args: ArgInfo[] }
export interface Catalog { get(name: string): OpLite | undefined; names(): string[] }

// Bloques propios de CipherFlow (no son de CyberChef): parámetros por nombre en «params».
export const CUSTOM_OPS: OpLite[] = [
  { name: '__input', category: 'Flujo', inputs: 0, description: 'Entrada: origen de datos. params: {"text": "...", "fmt": "Texto (UTF-8)" | "Hex" | "Base64"}.', args: [
    { name: 'text', type: 'string' }, { name: 'fmt', type: 'option', options: ['Texto (UTF-8)', 'Hex', 'Base64'], default: 'Texto (UTF-8)' }] },
  { name: '__output', category: 'Flujo', inputs: 1, description: 'Salida: muestra el resultado. params: {"label": "nombre visible"}.', args: [{ name: 'label', type: 'string' }] },
  { name: '__xor2', category: 'Flujo', inputs: 2, description: 'XOR byte a byte de dos entradas (puerto 0 y puerto 1); la segunda se repite si es más corta. Sin params.', args: [] },
  { name: '__concat', category: 'Flujo', inputs: 2, description: 'Concatena la entrada del puerto 0 y la del puerto 1. params: {"sep": "separador opcional"}.', args: [{ name: 'sep', type: 'string', default: '' }] },
]

const isHeading = (o: unknown) => typeof o === 'string' && /^\[[\s\S]*\]$/.test(o)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Catálogo real, a partir de la configuración del motor de CyberChef ya cargado. */
export function engineCatalog(opConfig: (n: string) => any, opInfo: (n: string) => { cat: string; desc: string; inputs: number }, allOps: () => string[]): Catalog {
  const cache = new Map<string, OpLite>()
  return {
    names: () => [...CUSTOM_OPS.map(o => o.name), ...allOps()],
    get(name) {
      const custom = CUSTOM_OPS.find(o => o.name === name)
      if (custom) return custom
      if (cache.has(name)) return cache.get(name)
      const cfg = opConfig(name)
      if (!cfg) return undefined
      const info = opInfo(name)
      const args: ArgInfo[] = cfg.args.filter((a: any) => a.type !== 'label').map((a: any) => {
        const v = a.value
        switch (a.type) {
          case 'option': return { name: a.name, type: 'option', options: (v as any[]).filter(x => !isHeading(x)).map(String), default: (v as any[]).filter(x => !isHeading(x))[a.defaultIndex ?? 0] }
          case 'argSelector': case 'populateOption': case 'populateMultiOption': return { name: a.name, type: 'option', options: (v as any[]).map((o: any) => o.name ?? String(o)) }
          case 'toggleString': return { name: a.name, type: 'toggleString', options: a.toggleValues, default: { string: v || '', option: a.toggleValues?.[0] } }
          case 'editableOption': case 'editableOptionShort': return { name: a.name, type: 'string', presets: (v as any[]).map((o: any) => String(o.value)).slice(0, 8), default: (v as any[])[a.defaultIndex ?? 0]?.value }
          default: return { name: a.name, type: a.type, default: v }
        }
      })
      const op: OpLite = { name, category: info.cat, description: clip(info.desc, 260), inputs: info.inputs, inType: cfg.inputType, outType: cfg.outputType, args }
      cache.set(name, op)
      return op
    },
  }
}

/** Descripción compacta de una operación para el modelo (parámetros y valores permitidos). */
export function describeOp(op: OpLite): string {
  const lines = [`${op.name} — ${op.category}. ${op.description}${op.inType ? ` Entra ${op.inType}, sale ${op.outType}.` : ''} Entradas: ${op.inputs}.`]
  if (!op.args.length) lines.push('  (sin parámetros)')
  for (const a of op.args) {
    let s = `  - "${a.name}" (${a.type})`
    if (a.type === 'toggleString') s += `: {"string": "valor", "option": uno de ${JSON.stringify(a.options)}}`
    else if (a.options) s += `: uno de ${JSON.stringify(a.options.slice(0, 24))}${a.options.length > 24 ? ' …' : ''}`
    if (a.presets?.length) s += ` (sugeridos: ${JSON.stringify(a.presets)})`
    if (a.default !== undefined && a.type !== 'toggleString') s += ` · por defecto ${JSON.stringify(a.default)}`
    lines.push(s)
  }
  return lines.join('\n')
}

// Pistas en español → términos de CyberChef, para encontrar operaciones desde el pedido del usuario
const SYN: Record<string, string[]> = {
  cifr: ['encrypt', 'aes', 'des', 'rc4', 'chacha'], descifr: ['decrypt'], hash: ['hash', 'sha', 'md5'], resumen: ['hash', 'sha'],
  firma: ['sign', 'hmac', 'rsa'], hmac: ['hmac'], clave: ['key', 'derive', 'pbkdf2'], contraseña: ['bcrypt', 'pbkdf2', 'hash'],
  base64: ['base64'], hex: ['hex'], binario: ['binary'], comprim: ['gzip', 'zlib', 'deflate'], descomprim: ['gunzip', 'inflate'],
  aleator: ['random', 'pseudo'], xor: ['xor'], url: ['url'], ip: ['ip'], dns: ['dns'], http: ['http'], tls: ['tls', 'ja3'], tcp: ['tcp'],
  jwt: ['jwt'], rsa: ['rsa'], vigenere: ['vigenère'], rot13: ['rot13'], cesar: ['rot13', 'caesar'], frecuencia: ['frequency', 'entropy'],
  entrop: ['entropy'], altera: ['find / replace', 'xor'], reemplaz: ['find / replace'], extrae: ['extract', 'regular expression'],
  imagen: ['image', 'render'], qr: ['qr'], fecha: ['timestamp', 'date'], uuid: ['uuid'], crc: ['crc'], checksum: ['checksum', 'crc'],
}

/** Operaciones más relevantes para un texto (puntuación por coincidencia de palabras). */
export function searchOps(cat: Catalog, query: string, n = 10): OpLite[] {
  const q = query.toLowerCase()
  const terms = new Set(q.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2))
  for (const [k, v] of Object.entries(SYN)) if (q.includes(k)) v.forEach(t => terms.add(t))
  const scored: [number, OpLite][] = []
  for (const name of cat.names()) {
    const op = cat.get(name)
    if (!op || name.startsWith('__')) continue
    const nm = name.toLowerCase(), desc = op.description.toLowerCase()
    let s = 0
    for (const t of terms) {
      if (nm === t) s += 12
      else if (nm.includes(t)) s += 6
      else if (desc.includes(t)) s += 1
    }
    if (s) scored.push([s, op])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length).slice(0, n).map(x => x[1])
}

/** Nombres parecidos (para sugerir cuando el modelo inventa una operación). */
export function suggestOps(cat: Catalog, name: string, n = 4): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = norm(name)
  const words = name.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  return cat.names().filter(x => !x.startsWith('__'))
    .map(x => ({ x, s: (norm(x).includes(target) || target.includes(norm(x)) ? 5 : 0) + words.filter(w => x.toLowerCase().includes(w)).length }))
    .filter(o => o.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(o => o.x)
}
