// Formato de flujo que genera el agente, su validación determinista (sin IA) y la
// conversión al formato interno de CipherFlow. «El modelo propone, el harness dispone».
import type { Catalog } from './catalog'
import { suggestOps } from './catalog'
import type { Validation } from './harness'

export interface AIBlock { key: string; op: string; args?: Record<string, any>; params?: Record<string, any> }
export interface AILink { from: string; to: string; port: number }
/** Resultado esperado que el agente declara y el harness comprueba al ejecutar. */
export interface AICheck { block: string; contains?: string; startsWith?: string; fails?: boolean; differentFrom?: string }
export interface AIFlow { title: string; blocks: AIBlock[]; links: AILink[]; checks: AICheck[]; open?: string }

export const FORMAT_HINT =
  'Formato: {"title": string, "blocks": [{"key": string, "op": string, "args"?: {…}, "params"?: {…}}], ' +
  '"links": [[desde, hacia, puerto?]], "checks"?: [{"block": key, "contains"|"startsWith"|"differentFrom": string} | {"block": key, "fails": true}], "open"?: key}'

const MAX_BLOCKS = 24

function normLinks(raw: any): AILink[] | string {
  if (!Array.isArray(raw)) return '«links» debe ser una lista.'
  const out: AILink[] = []
  for (const l of raw) {
    if (Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string') out.push({ from: l[0], to: l[1], port: Number(l[2] ?? 0) || 0 })
    else if (l && typeof l === 'object' && typeof l.from === 'string' && typeof l.to === 'string') out.push({ from: l.from, to: l.to, port: Number(l.port ?? 0) || 0 })
    else return `Enlace no válido: ${JSON.stringify(l)}. Usa ["desde", "hacia", puerto].`
  }
  return out
}

/** Comprueba el flujo contra el catálogo y lo normaliza (valores de desplegables, números, booleanos). */
export function validateAIFlow(obj: any, cat: Catalog): Validation<AIFlow> {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Se esperaba un objeto JSON.'] }
  const blocksIn = Array.isArray(obj.blocks) ? obj.blocks : null
  if (!blocksIn?.length) return { ok: false, errors: ['«blocks» debe ser una lista con al menos un bloque.'] }
  if (blocksIn.length > MAX_BLOCKS) errors.push(`Demasiados bloques (${blocksIn.length}); máximo ${MAX_BLOCKS}.`)

  const blocks: AIBlock[] = []
  const byKey = new Map<string, AIBlock>()
  /** Bloques con operación inválida: sus cables no se reportan (el error ya está dicho). */
  const broken = new Set<string>()
  for (const b of blocksIn) {
    const key = typeof b?.key === 'string' ? b.key.trim() : ''
    if (!key) { errors.push(`Un bloque no tiene «key»: ${JSON.stringify(b).slice(0, 80)}`); continue }
    if (byKey.has(key)) { errors.push(`La key «${key}» está repetida.`); continue }
    const op = cat.get(b.op)
    if (!op) {
      broken.add(key)
      const sug = suggestOps(cat, String(b.op ?? ''))
      errors.push(`«${key}»: la operación «${b.op}» no existe.${sug.length ? ` ¿Quisiste decir: ${sug.map(s => `«${s}»`).join(', ')}?` : ' Usa buscar_operaciones.'}`)
      continue
    }
    const custom = op.name.startsWith('__')
    const given: Record<string, any> = { ...(custom ? b.params ?? b.args : b.args ?? b.params) }
    const clean: Record<string, any> = {}
    for (const [name, val] of Object.entries(given)) {
      const arg = op.args.find(a => a.name === name) ?? op.args.find(a => a.name.toLowerCase() === name.toLowerCase())
      if (!arg) { errors.push(`«${key}» (${op.name}): el parámetro «${name}» no existe. Parámetros: ${op.args.map(a => `«${a.name}»`).join(', ') || 'ninguno'}.`); continue }
      if (arg.type === 'option' && arg.options?.length) {
        const hit = arg.options.find(o => o === String(val)) ?? arg.options.find(o => o.toLowerCase() === String(val).toLowerCase())
        if (!hit) { errors.push(`«${key}» (${op.name}): «${arg.name}» = ${JSON.stringify(val)} no es válido. Valores: ${JSON.stringify(arg.options.slice(0, 20))}.`); continue }
        clean[arg.name] = hit
      } else if (arg.type === 'toggleString') {
        if (!val || typeof val !== 'object' || typeof val.string !== 'string') { errors.push(`«${key}» (${op.name}): «${arg.name}» debe ser {"string": "…", "option": uno de ${JSON.stringify(arg.options)}}.`); continue }
        const opt = arg.options?.find(o => o.toLowerCase() === String(val.option ?? '').toLowerCase())
        if (!opt) { errors.push(`«${key}» (${op.name}): el formato de «${arg.name}» debe ser uno de ${JSON.stringify(arg.options)}.`); continue }
        clean[arg.name] = { string: val.string, option: opt }
      } else if (arg.type === 'number') {
        const n = Number(val)
        if (!Number.isFinite(n)) { errors.push(`«${key}» (${op.name}): «${arg.name}» debe ser un número.`); continue }
        clean[arg.name] = n
      } else if (arg.type === 'boolean') {
        clean[arg.name] = val === true || val === 'true'
      } else clean[arg.name] = typeof val === 'string' ? val : JSON.stringify(val)
    }
    if (op.name === '__input' && !String(clean.text ?? '').trim()) errors.push(`«${key}» (Entrada): falta params.text con el dato de entrada (no puede estar vacío).`)
    const blk: AIBlock = custom ? { key, op: op.name, params: clean } : { key, op: op.name, args: clean }
    blocks.push(blk)
    byKey.set(key, blk)
  }

  const links = normLinks(obj.links ?? [])
  if (typeof links === 'string') errors.push(links)
  const L = typeof links === 'string' ? [] : links
  const used = new Set<string>()
  for (const l of L) {
    if (broken.has(l.from) || broken.has(l.to)) continue
    const a = byKey.get(l.from), z = byKey.get(l.to)
    if (!a) { errors.push(`Enlace desde «${l.from}»: ese bloque no existe.`); continue }
    if (!z) { errors.push(`Enlace hacia «${l.to}»: ese bloque no existe.`); continue }
    if (a.op === '__output') errors.push(`«${l.from}» es una Salida: no tiene salida para conectar.`)
    const inputs = cat.get(z.op)!.inputs
    if (inputs === 0) errors.push(`«${l.to}» es una Entrada: no recibe conexiones.`)
    else if (l.port >= inputs) errors.push(`«${l.to}» solo tiene ${inputs} entrada(s) (puertos 0${inputs > 1 ? '–' + (inputs - 1) : ''}); usaste el puerto ${l.port}.`)
    const slot = `${l.to}#${l.port}`
    if (used.has(slot)) errors.push(`El puerto ${l.port} de «${l.to}» tiene dos cables; cada entrada admite uno.`)
    used.add(slot)
  }
  for (const b of blocks) {
    const inputs = cat.get(b.op)!.inputs
    for (let p = 0; p < inputs; p++) if (!used.has(`${b.key}#${p}`) && !L.some(l => l.to === b.key && l.port === p && broken.has(l.from))) errors.push(`«${b.key}» (${b.op}) no tiene nada conectado en el puerto ${p}.`)
  }
  if (hasCycle(blocks.map(b => b.key), L)) errors.push('Los enlaces forman un ciclo; el flujo debe ir en una sola dirección.')

  const checks: AICheck[] = []
  for (const c of Array.isArray(obj.checks) ? obj.checks : []) {
    if (!c || !byKey.has(c.block)) { errors.push(`Comprobación sobre un bloque inexistente: ${JSON.stringify(c).slice(0, 80)}`); continue }
    if (c.differentFrom && !byKey.has(c.differentFrom)) { errors.push(`«differentFrom» apunta a «${c.differentFrom}», que no existe.`); continue }
    if (c.contains === undefined && c.startsWith === undefined && c.fails !== true && !c.differentFrom) { errors.push(`La comprobación sobre «${c.block}» no dice qué esperar.`); continue }
    checks.push({ block: c.block, contains: c.contains, startsWith: c.startsWith, fails: c.fails === true || undefined, differentFrom: c.differentFrom })
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { title: String(obj.title || 'Flujo generado').slice(0, 80), blocks, links: L, checks, open: byKey.has(obj.open) ? obj.open : undefined } }
}

function hasCycle(keys: string[], links: AILink[]) {
  const adj = new Map(keys.map(k => [k, [] as string[]]))
  links.forEach(l => adj.get(l.from)?.push(l.to))
  const state = new Map<string, number>()
  const visit = (k: string): boolean => {
    if (state.get(k) === 1) return true
    if (state.get(k) === 2) return false
    state.set(k, 1)
    for (const n of adj.get(k) ?? []) if (visit(n)) return true
    state.set(k, 2)
    return false
  }
  return keys.some(visit)
}

/** Posiciones en columnas por profundidad (de izquierda a derecha) para el formato de CipherFlow. */
export function layoutFlow(f: AIFlow): { n: [string, string, number, number, Record<string, any>?][]; e: [string, string, number?][] } {
  const depth = new Map<string, number>()
  const d = (k: string, seen = new Set<string>()): number => {
    if (depth.has(k)) return depth.get(k)!
    if (seen.has(k)) return 0
    seen.add(k)
    const ins = f.links.filter(l => l.to === k)
    const v = ins.length ? Math.max(...ins.map(l => d(l.from, seen) + 1)) : 0
    depth.set(k, v)
    return v
  }
  const rows = new Map<number, number>()
  const n = f.blocks.map(b => {
    const c = d(b.key)
    const r = rows.get(c) ?? 0
    rows.set(c, r + 1)
    return [b.key, b.op, c * 340, r * 230, b.op.startsWith('__') ? b.params : b.args] as [string, string, number, number, Record<string, any>?]
  })
  return { n, e: f.links.map(l => [l.from, l.to, l.port] as [string, string, number]) }
}
