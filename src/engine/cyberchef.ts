// Puente con el motor de CyberChef compilado en public/engine/.
// El núcleo (tipos de datos y catálogo) se carga al iniciar; cada operación, cuando se usa.
import { stripTags } from '../lib/bytes'

const BASE = import.meta.env.BASE_URL + 'engine/'

export interface ArgConfig {
  name: string
  type: string
  value: any
  toggleValues?: string[]
  defaultIndex?: number
  target?: number | number[]
  min?: number
  max?: number
  step?: number
}
export interface OpConfig {
  module: string
  description: string
  infoURL?: string
  inputType: string
  outputType: string
  flowControl: boolean
  args: ArgConfig[]
}

interface Manifest { ops: Record<string, string>; sizes: Record<string, number> }
interface Core { Dish: any; Recipe: any; OperationConfig: Record<string, OpConfig>; Categories: { name: string; ops: string[] }[] }

let core: Core | null = null
let manifest: Manifest | null = null

export async function loadEngine(): Promise<void> {
  if (core) return
  const [c, m] = await Promise.all([
    import(/* @vite-ignore */ BASE + 'core.js'),
    fetch(BASE + 'manifest.json').then(r => r.json()),
  ])
  core = c as Core
  manifest = m as Manifest
}

export const engine = () => {
  if (!core) throw new Error('El motor de CyberChef aún no está cargado')
  return core
}
export const opConfig = (name: string): OpConfig | undefined => core?.OperationConfig[name]
export const opDownloadSize = (name: string) => manifest ? manifest.sizes[manifest.ops[name]] ?? 0 : 0

const opClasses = new Map<string, Promise<any>>()
const loaded = new Set<string>()
export const isOpLoaded = (name: string) => loaded.has(name)

export function loadOpClass(name: string): Promise<any> {
  const file = manifest?.ops[name]
  if (!file) return Promise.reject(new Error(`La operación «${name}» no existe en esta versión de CyberChef`))
  let p = opClasses.get(name)
  if (!p) {
    p = import(/* @vite-ignore */ BASE + 'op/' + file + '.js').then(m => { loaded.add(name); return m.default })
    p.catch(() => opClasses.delete(name))
    opClasses.set(name, p)
  }
  return p
}

export function newDish(value: any = '', type = 'string') {
  const d = new (engine().Dish)()
  d.set(value, type)
  return d
}

export function bytesDish(b: Uint8Array) {
  return newDish(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'ArrayBuffer')
}

export const dishType = (d: any): string => engine().Dish.enumLookup(d.type)

export async function dishBytes(d: any): Promise<Uint8Array> {
  return new Uint8Array(await d.clone().get('ArrayBuffer'))
}

export async function dishString(d: any): Promise<string> {
  return await d.clone().get('string')
}

function cleanError(e: any, name: string): string {
  const msg = stripTags(e?.displayStr || e?.message || String(e))
  return msg.replace(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' - '), '') || 'La operación falló'
}

/** Ejecuta una operación sobre una copia del dato de entrada, como lo haría una receta de CyberChef. */
export async function runOperation(name: string, args: any[], input: any | null) {
  const Op = await loadOpClass(name)
  const op = new Op()
  try {
    op.ingValues = args
    op.validateIngredients?.(op.ingValues)
  } catch (e) { throw new Error('Parámetros no válidos: ' + cleanError(e, name)) }
  const dish = input ? input.clone() : newDish('', 'string')
  try {
    if (op.flowControl) {
      await op.run({ progress: 0, dish, opList: [op], numJumps: 0, numRegisters: 0, forkOffset: 0 })
    } else {
      const out = await op.run(await dish.get(op.inputType), op.ingValues)
      dish.set(out, op.outputType)
    }
  } catch (e) { throw new Error(cleanError(e, name)) }
  return { dish, op }
}

/** Genera la vista enriquecida (HTML) que CyberChef muestra para algunas operaciones. */
export async function presentHTML(op: any, dish: any): Promise<string | null> {
  if (!op || op.presentType !== 'html') return null
  try { return String(await op.present(await dish.clone().get(op.outputType), op.ingValues)) } catch { return null }
}

export function defaultArgs(name: string): any[] {
  const cfg = opConfig(name)
  if (!cfg) return []
  return cfg.args.map(a => {
    const v = a.value
    switch (a.type) {
      case 'option':
        return Array.isArray(v) ? (v.filter(x => !(typeof x === 'string' && /^\[[\s\S]*\]$/.test(x)))[a.defaultIndex ?? 0] ?? v[0]) : v
      case 'argSelector': return Array.isArray(v) ? (v[a.defaultIndex ?? 0]?.name ?? '') : v
      case 'editableOption': case 'editableOptionShort': return Array.isArray(v) ? (v[a.defaultIndex ?? 0]?.value ?? '') : v
      case 'toggleString': return { string: v || '', option: a.toggleValues?.[0] }
      case 'populateOption': case 'populateMultiOption': return Array.isArray(v) ? (v[0]?.name ?? '') : v
      default: return v
    }
  })
}

export function namedArgs(name: string, values: Record<string, any>): any[] {
  const a = defaultArgs(name)
  const cfg = opConfig(name)
  if (!cfg) return a
  for (const [k, v] of Object.entries(values)) { const i = cfg.args.findIndex(x => x.name === k); if (i >= 0) a[i] = v }
  return a
}

/** Argumentos ocultos según los selectores (argSelector) activos, como en la interfaz de CyberChef. */
export function hiddenArgs(cfg: OpConfig, args: any[]): Set<number> {
  const hid = new Set<number>()
  cfg.args.forEach(a => { if (a.type === 'argSelector' && Array.isArray(a.value)) a.value.forEach((o: any) => (o.on || []).forEach((j: number) => hid.add(j))) })
  cfg.args.forEach((a, i) => {
    if (a.type !== 'argSelector' || !Array.isArray(a.value)) return
    const o = a.value.find((o: any) => o.name === args[i])
    if (!o) return
    ;(o.on || []).forEach((j: number) => hid.delete(j))
    ;(o.off || []).forEach((j: number) => hid.add(j))
  })
  return hid
}
