// Orquestador del asistente de flujos (patrón de PSEINT_Converter sobre el harness de Codara):
//   planificar → construir (JSON) → validar (sin IA) → ejecutar en el motor real → reparar
// El verificador es el propio motor de CyberChef en el navegador: los errores que se devuelven
// al modelo son los reales de cada bloque, y las comprobaciones esperadas se evalúan con datos reales.
import type { AgentConfig, CompleteFn, Message } from './llm'
import { describeOp, searchOps, type Catalog } from './catalog'
import { FORMAT_HINT, layoutFlow, validateAIFlow, type AIFlow } from './flowSpec'
import { feedback, recordMetric, runStructured } from './harness'

export interface NodeOutcome { ok: boolean; err?: string; text?: string }
/** Ejecuta un flujo (formato de CipherFlow) y devuelve el resultado de cada bloque por su key. */
export type ExecuteFn = (flow: ReturnType<typeof layoutFlow>) => Promise<Record<string, NodeOutcome>>

export type FlowStep =
  | { type: 'plan'; ops: string[] }
  | { type: 'build'; round: number; retry?: boolean }
  | { type: 'invalid'; round: number; errors: string[] }
  | { type: 'built'; round: number; flow: AIFlow }
  | { type: 'run'; round: number }
  | { type: 'ran'; round: number; outcomes: Record<string, NodeOutcome>; failed: string[]; checks: CheckResult[] }
  | { type: 'repair'; round: number; reasons: string[] }
  | { type: 'model'; text: string; progress: number }
  | { type: 'done'; result: FlowResult | null; message?: string }

export interface CheckResult { description: string; ok: boolean }
export interface FlowResult { flow: AIFlow; outcomes: Record<string, NodeOutcome>; checks: CheckResult[]; success: boolean; rounds: number }

export interface FlowAgentRequest {
  request: string
  config: AgentConfig
  complete: CompleteFn
  catalog: Catalog
  execute: ExecuteFn
  onStep: (s: FlowStep) => void
  signal?: AbortSignal
  maxRounds?: number
  /** Flujo abierto en el lienzo: el pedido puede referirse a él («añade…», «cambia…»). */
  current?: { json: string; outputs: string[]; expand: (f: AIFlow) => AIFlow }
}

const SYSTEM = `Eres el asistente de CipherFlow, un editor visual de flujos criptográficos: cada bloque es una operación de CyberChef y los cables llevan los datos de un bloque al siguiente.
Tu tarea: construir el flujo que pide el usuario y responder SOLO con JSON.

${FORMAT_HINT}

Reglas:
- Usa solo operaciones que existan, con su nombre EXACTO (en inglés, como en CyberChef) y los nombres EXACTOS de sus parámetros. Si dudas, pide la herramienta describir_operacion.
- Bloques propios: "__input" (params.text y params.fmt: "Texto (UTF-8)", "Hex" o "Base64"), "__output" (params.label, un nombre claro en español), "__xor2" (XOR de dos entradas: puertos 0 y 1) y "__concat" (une puerto 0 + puerto 1).
- Los parámetros de tipo toggleString (claves, IV…) van como {"string": "valor", "option": "Hex"}. Una clave AES-128 en Hex tiene 32 caracteres hexadecimales.
- Cada entrada de un bloque recibe un solo cable. Todas las operaciones necesitan su entrada conectada.
- Pon un "__output" con etiqueta al final de cada resultado importante.
- Declara en "checks" lo que debe ocurrir (por ejemplo "contains" en una salida, o "fails": true en un bloque que DEBE fallar a propósito). Se verificará ejecutando el flujo.
- Máximo 15 bloques. Títulos y etiquetas en español.

Herramientas (responde SOLO con este JSON para usarlas):
{"tool": "describir_operacion", "args": {"nombre": "AES Encrypt"}}
{"tool": "buscar_operaciones", "args": {"consulta": "hmac sha256"}}`

function outcomeText(o?: NodeOutcome) { return o?.ok ? (o.text ?? '') : '' }

export function evaluateChecks(flow: AIFlow, outcomes: Record<string, NodeOutcome>): CheckResult[] {
  return flow.checks.map(c => {
    const o = outcomes[c.block]
    if (c.fails) return { description: `«${c.block}» debe fallar`, ok: !!o && !o.ok }
    if (!o?.ok) return { description: `«${c.block}» debe funcionar`, ok: false }
    const t = outcomeText(o)
    if (c.contains !== undefined) return { description: `«${c.block}» contiene «${c.contains}»`, ok: t.includes(c.contains) }
    if (c.startsWith !== undefined) return { description: `«${c.block}» empieza por «${c.startsWith}»`, ok: t.startsWith(c.startsWith) }
    return { description: `«${c.block}» es distinto de «${c.differentFrom}»`, ok: !!outcomes[c.differentFrom!]?.ok && t !== outcomeText(outcomes[c.differentFrom!]) }
  })
}

export async function runFlowAgent(req: FlowAgentRequest): Promise<FlowResult | null> {
  const maxRounds = Math.max(1, req.maxRounds ?? 3)
  recordMetric('flowRuns')

  // Planificar: operaciones relevantes para el pedido (contexto acotado, como el chunking de Codara)
  const relevant = searchOps(req.catalog, req.request, 10)
  req.onStep({ type: 'plan', ops: relevant.slice(0, 6).map(o => o.name) })
  const context = relevant.slice(0, 6).map(describeOp).join('\n\n')
  const others = relevant.slice(6).map(o => o.name)

  const tools = {
    describir_operacion: {
      description: 'Parámetros exactos de una operación',
      run: (a: any) => { const op = req.catalog.get(String(a?.nombre ?? a?.name ?? '')); return op ? describeOp(op) : `No existe «${a?.nombre}». Usa buscar_operaciones.` },
    },
    buscar_operaciones: {
      description: 'Operaciones que coinciden con una consulta',
      run: (a: any) => { const r = searchOps(req.catalog, String(a?.consulta ?? a?.query ?? ''), 12); return r.length ? r.map(o => `${o.name} — ${o.description.slice(0, 110)}`).join('\n') : 'Sin resultados.' },
    },
  }

  const cur = req.current
    ? `Flujo ABIERTO ahora en el lienzo (keys b1, b2…; solo aparecen los parámetros distintos del valor por defecto):\n${req.current.json}\n` +
      (req.current.outputs.length ? `Salidas actuales:\n${req.current.outputs.join('\n')}\n` : '') +
      'Si el pedido se refiere a este flujo (modificar, añadir, quitar, cambiar datos, «este flujo»…), responde con el flujo COMPLETO ya modificado: ' +
      'conserva las keys, los datos de entrada y los parámetros de los bloques que no cambies, y usa keys nuevas para los bloques nuevos. ' +
      'Un texto «⟨conservar:bN⟩» es un dato largo del usuario: déjalo tal cual. Si el pedido es un flujo distinto e independiente, ignora el actual.\n\n'
    : ''
  let messages: Message[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${cur}Pedido del usuario:\n${req.request}\n\nOperaciones probablemente útiles (con sus parámetros):\n${context || '(ninguna encontrada; usa buscar_operaciones)'}${others.length ? `\n\nOtras posibles: ${others.join(', ')}` : ''}\n\nResponde con el JSON del flujo.` },
  ]

  let best: FlowResult | null = null
  for (let round = 1; round <= maxRounds; round++) {
    req.onStep({ type: 'build', round })
    const res = await runStructured<AIFlow>({
      config: req.config, messages, complete: req.complete, signal: req.signal, tools,
      validate: o => { const v = validateAIFlow(o, req.catalog); return v.ok && req.current ? { ok: true, value: req.current.expand(v.value) } : v }, formatHint: FORMAT_HINT, maxAttempts: 2, maxToolRounds: 4,
      onProgress: p => req.onStep({ type: 'model', text: p.text, progress: p.progress }),
      onRejected: errors => { req.onStep({ type: 'invalid', round, errors }); req.onStep({ type: 'build', round, retry: true }) },
    })
    messages = res.messages
    if (!res.value) {
      req.onStep({ type: 'invalid', round, errors: res.errors })
      if (round < maxRounds) messages.push({ role: 'user', content: feedback(res.errors, FORMAT_HINT) })
      continue
    }
    const flow = res.value
    req.onStep({ type: 'built', round, flow })

    // Ejecutar en el motor real
    req.onStep({ type: 'run', round })
    const outcomes = await req.execute(layoutFlow(flow))
    const expectedFail = new Set(flow.checks.filter(c => c.fails).map(c => c.block))
    const failed = flow.blocks.filter(b => outcomes[b.key] && !outcomes[b.key].ok && !expectedFail.has(b.key))
      // un bloque que falla solo porque falló el anterior no es la causa
      .filter(b => outcomes[b.key].err !== 'Hay un error en un bloque anterior')
      .map(b => b.key)
    const checks = evaluateChecks(flow, outcomes)
    req.onStep({ type: 'ran', round, outcomes, failed, checks })
    const success = !failed.length && checks.every(c => c.ok)
    const result: FlowResult = { flow, outcomes, checks, success, rounds: round }
    const score = (r: FlowResult) => Object.values(r.outcomes).filter(o => o.ok).length + r.checks.filter(c => c.ok).length
    if (!best || success || score(result) > score(best)) best = result
    if (success) { recordMetric('flowSuccess'); req.onStep({ type: 'done', result }); return result }

    // Reparar con los errores reales
    const reasons = [
      ...failed.map(k => `El bloque «${k}» (${flow.blocks.find(b => b.key === k)!.op}) falló: ${outcomes[k].err}`),
      ...checks.filter(c => !c.ok).map(c => `No se cumple: ${c.description}.`),
    ]
    const shown = flow.blocks.filter(b => b.op === '__output' || failed.includes(b.key)).slice(0, 6)
      .map(b => `- ${b.key}: ${outcomes[b.key]?.ok ? JSON.stringify(outcomeText(outcomes[b.key]).slice(0, 160)) : 'ERROR ' + outcomes[b.key]?.err}`)
    if (round < maxRounds) {
      recordMetric('flowRepairs')
      req.onStep({ type: 'repair', round, reasons })
      messages.push({ role: 'user', content: `Ejecuté tu flujo en el motor real y hay problemas:\n${reasons.map(r => `- ${r}`).join('\n')}\n\nSalidas obtenidas:\n${shown.join('\n')}\n\nCorrige el flujo y responde con el JSON completo.` })
    }
  }
  req.onStep({ type: 'done', result: best, message: best ? 'No se consiguió que todo funcionara; este es el mejor intento.' : 'El modelo no produjo un flujo válido.' })
  return best
}
