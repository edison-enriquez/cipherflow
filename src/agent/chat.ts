// Conversación con el asistente (como Copilot Chat): mensajes del usuario con su contexto
// adjunto (un bloque o el flujo), respuestas con citas verificadas y propuestas de flujo que se
// aplican paso a paso. Un hilo por flujo, guardado en el navegador.
import type { Message } from './llm'
import type { AIFlow } from './flowSpec'
import type { ApplyStep } from './steps'

export interface TraceItem { state: 'ok' | 'warn' | 'err' | 'info'; title: string; detail?: string[] }
/** Resultado de un bloque, recortado para guardarlo */
export interface OutcomeLite { ok: boolean; text?: string; err?: string }

export type ChatMsg =
  | { id: string; role: 'user'; text: string; block?: { id: string; label: string } }
  | { id: string; role: 'answer'; text: string; citations: string[]; rejected: string[]; followups: string[] }
  | {
      id: string; role: 'flow'; title: string; success: boolean; rounds: number
      flow: AIFlow; outcomes: Record<string, OutcomeLite>; trace: TraceItem[]
      /** 'current': cambia el flujo abierto (paso a paso); 'new': se abre como flujo aparte */
      target: 'current' | 'new'
      /** Flujo abierto cuando se pidió (para calcular los pasos) */
      before: AIFlow | null
      steps: ApplyStep[]
      applied: number
      status: 'pending' | 'done' | 'discarded'
    }
  | { id: string; role: 'error'; text: string }

export interface ChatThread { id: string; flowKey: string; title: string; created: number; updated: number; messages: ChatMsg[] }

export type Intent = { kind: 'ask' | 'build'; text: string }

const ASK_START = /^(qu[ée]|por\s*qu[ée]|c[óo]mo|cu[áa]l(es)?|cu[áa]nto|para\s*qu[ée]|d[óo]nde|explica|expl[íi]came|describe|resume|es\s|est[áa]\s|hay\s|puedo\s|sirve)/i

/**
 * ¿El mensaje es una pregunta (se responde) o un pedido de cambio (se construye un flujo)?
 * `/explicar` y `/preguntar` fuerzan pregunta; `/arreglar` y `/flujo` fuerzan construir.
 */
export function routeIntent(raw: string, hasBlock: boolean): Intent {
  const t = raw.trim()
  const slash = /^\/(\w+)\s*/.exec(t)
  const rest = slash ? t.slice(slash[0].length).trim() : t
  switch (slash?.[1]?.toLowerCase()) {
    case 'explicar': return { kind: 'ask', text: rest || (hasBlock ? 'Explica qué hace este bloque con sus datos reales.' : 'Explica qué hace este flujo, paso a paso.') }
    case 'preguntar': return { kind: 'ask', text: rest }
    case 'arreglar': return { kind: 'build', text: rest || (hasBlock ? 'Arregla este bloque para que funcione.' : 'Arregla los bloques que fallan en este flujo.') }
    case 'flujo': return { kind: 'build', text: rest }
  }
  return { kind: t.endsWith('?') || t.startsWith('¿') || ASK_START.test(t) ? 'ask' : 'build', text: t }
}

/** Últimos turnos en texto para dar continuidad a las preguntas. */
export function historyOf(msgs: ChatMsg[], n = 6): Message[] {
  const out: Message[] = []
  for (const m of msgs) {
    if (m.role === 'user') out.push({ role: 'user', content: m.block ? `[Sobre el bloque ${m.block.label}] ${m.text}` : m.text })
    else if (m.role === 'answer') out.push({ role: 'assistant', content: m.text })
    else if (m.role === 'flow') out.push({ role: 'assistant', content: `(Propuse el flujo «${m.title}» con ${m.flow.blocks.length} bloques.)` })
  }
  return out.slice(-n)
}

export const threadTitle = (msgs: ChatMsg[]) => {
  const u = msgs.find(m => m.role === 'user') as Extract<ChatMsg, { role: 'user' }> | undefined
  return u ? (u.text.length > 60 ? u.text.slice(0, 59) + '…' : u.text) : 'Conversación nueva'
}
