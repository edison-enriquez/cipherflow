// OpenCode (local): los modelos gratuitos de OpenCode Zen solo se sirven al propio OpenCode, así
// que se usan a través de `opencode serve` en el equipo del usuario (API de sesiones /api/session,
// la del cliente oficial). Verificado con OpenCode 1.18.32 (2026-09).
//
// Seguridad: el servidor ejecuta un agente con herramientas (leer archivos, buscar…) en su carpeta.
// Por eso se arranca con un agente propio «cipherflow» sin herramientas y con todos los permisos
// denegados (OPENCODE_CONFIG_CONTENT), y cada sesión usa ese agente: sin él, un dato de un flujo con
// instrucciones maliciosas podría hacer que el modelo leyera archivos del equipo.
import type { Message } from './llm'

export const OPENCODE_DEFAULT_URL = 'http://127.0.0.1:4096'
export const OPENCODE_DEFAULT_MODEL = 'big-pickle'
export const OPENCODE_AGENT = 'cipherflow'

/** Configuración del agente sin herramientas con la que se arranca el servidor */
export const OPENCODE_AGENT_CONFIG = {
  agent: {
    [OPENCODE_AGENT]: {
      mode: 'primary',
      description: 'CipherFlow: solo texto, sin herramientas',
      prompt: 'Sigue las instrucciones del mensaje al pie de la letra. Responde solo con texto; no uses herramientas.',
      tools: { '*': false },
      permission: { '*': 'deny' },
    },
  },
}

export interface OpenCodeSettings { url: string; password: string }

export type Shell = 'powershell' | 'bash'
/** 'cli': OpenCode ya instalado (comando `opencode`); 'npx': sin instalar, se descarga con Node.js */
export type Runner = 'cli' | 'npx'

export interface ServeOptions { shell: Shell; runner: Runner; password: string; origin: string; url?: string }

/** Comando para arrancar el servidor, con la contraseña, el agente sin herramientas y el origen de la página */
export function serveCommand({ shell, runner, password, origin, url = OPENCODE_DEFAULT_URL }: ServeOptions) {
  const { hostname, port } = new URL(url)
  const cfg = JSON.stringify(OPENCODE_AGENT_CONFIG)
  const bin = runner === 'cli' ? 'opencode' : 'npx -y opencode-ai'
  const args = `serve --hostname ${hostname} --port ${port || '4096'} --cors ${origin}`
  return shell === 'powershell'
    ? `$env:OPENCODE_SERVER_PASSWORD='${password}'; $env:OPENCODE_CONFIG_CONTENT='${cfg}'; ${bin} ${args}`
    : `OPENCODE_SERVER_PASSWORD='${password}' OPENCODE_CONFIG_CONTENT='${cfg}' ${bin} ${args}`
}

/** Instalación del CLI de OpenCode (una sola vez) */
export const installCommand = (shell: Shell) =>
  shell === 'powershell' ? 'npm install -g opencode-ai' : 'curl -fsSL https://opencode.ai/install | bash'

/** Contraseña aleatoria (24 bytes → 32 caracteres Base64url): distinta en cada navegador y segura en el comando */
export const newPassword = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const MIN_PASSWORD = 12
/** Motivo por el que la contraseña no vale, o null. Va entre comillas simples en el comando: no puede llevar «'». */
export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Usa al menos ${MIN_PASSWORD} caracteres.`
  if (/['\s]/.test(p)) return 'Sin comillas simples ni espacios (romperían el comando).'
  if (/[\u0000-\u001f\u007f]/.test(p)) return 'Sin caracteres de control.'
  return null
}

type Fetch = typeof fetch

function client(s: OpenCodeSettings, f: Fetch = fetch) {
  const base = (s.url || OPENCODE_DEFAULT_URL).replace(/\/+$/, '')
  const auth = 'Basic ' + btoa(`opencode:${s.password}`)
  return async (path: string, init: RequestInit = {}): Promise<any> => {
    let res: Response
    try {
      res = await f(base + path, { ...init, headers: { Authorization: auth, 'Content-Type': 'application/json' } })
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      throw new Error(`OpenCode: no hay servidor en ${base}. Arráncalo con el comando de Ajustes de IA (y permite el acceso a la red local si el navegador lo pregunta).`)
    }
    if (res.status === 401) throw new Error('OpenCode: la contraseña no coincide con la del servidor. Copia de nuevo el comando de Ajustes de IA y reinícialo.')
    const text = await res.text()
    if (!res.ok) throw new Error(`OpenCode respondió con HTTP ${res.status}: ${text.slice(0, 160)}`)
    try { return JSON.parse(text) } catch { throw new Error('OpenCode: respuesta inesperada del servidor (¿es la versión 1.18 o posterior?).') }
  }
}

/** Mensajes del chat en un solo texto (la sesión de OpenCode recibe un único prompt por llamada). */
export function toTranscript(messages: Message[], json?: boolean): string {
  const label = { system: 'Instrucciones', user: 'Usuario', assistant: 'Asistente' } as const
  const parts = messages.map(m => `${label[m.role]}:\n${m.content}`)
  if (json) parts.push('Instrucciones:\nResponde SOLO con JSON válido, sin texto antes ni después.')
  return parts.join('\n\n')
}

/** Texto final de la sesión (sin el razonamiento ni las llamadas a herramientas), o null si aún no terminó. */
export function finalText(data: any): { done: boolean; text?: string; error?: string } {
  const raw = JSON.stringify(data)
  if (/FreeTierError|free tier can only be used/i.test(raw)) return { done: true, error: 'OpenCode rechazó el modelo gratuito (FreeTierError). Actualiza OpenCode o elige otro modelo.' }
  const last = (Array.isArray(data?.data) ? data.data : []).filter((m: any) => m.type === 'assistant').at(-1)
  if (!last) return { done: false }
  if (last.error) return { done: true, error: `OpenCode: ${typeof last.error === 'string' ? last.error : last.error.message ?? JSON.stringify(last.error).slice(0, 160)}` }
  if (!last.time?.completed || last.finish === 'tool-calls') return { done: false }
  const text = (last.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
  return { done: true, text }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, ko) => {
  const t = setTimeout(ok, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); ko(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

export interface OpenCodeCall {
  settings: OpenCodeSettings
  model: string
  messages: Message[]
  json?: boolean
  signal?: AbortSignal
  /** Máximo de espera por respuesta, en ms */
  timeout?: number
  onProgress?: (text: string) => void
  fetch?: Fetch
}

/** Una llamada al modelo: sesión nueva con el agente sin herramientas → prompt → esperar el texto → borrar la sesión. */
export async function openCodeComplete(o: OpenCodeCall): Promise<string> {
  const call = client(o.settings, o.fetch)
  const s = await call('/api/session', { method: 'POST', signal: o.signal, body: JSON.stringify({ agent: OPENCODE_AGENT, model: { providerID: 'opencode', id: o.model } }) })
  const id: string | undefined = s?.data?.id
  if (!id) throw new Error('OpenCode no creó la sesión.')
  try {
    await call(`/api/session/${id}/prompt`, { method: 'POST', signal: o.signal, body: JSON.stringify({ prompt: { text: toTranscript(o.messages, o.json) } }) })
    const t0 = Date.now(), limit = o.timeout ?? 120_000
    for (let delay = 400; ; delay = Math.min(1500, delay * 1.5)) {
      await sleep(delay, o.signal)
      const r = finalText(await call(`/api/session/${id}/message?limit=50&order=asc`, { signal: o.signal }))
      if (r.error) throw new Error(r.error)
      if (r.done) {
        if (!r.text) throw new Error(`OpenCode: «${o.model}» respondió vacío. Prueba con otro modelo.`)
        return r.text
      }
      const secs = Math.round((Date.now() - t0) / 1000)
      if (secs > 4) o.onProgress?.(`OpenCode · ${o.model}: esperando respuesta (${secs} s)…`)
      if (Date.now() - t0 > limit) throw new Error(`OpenCode: «${o.model}» no respondió en ${Math.round(limit / 1000)} s. Prueba con otro modelo gratuito.`)
    }
  } catch (e) {
    if ((e as any)?.name === 'AbortError') call(`/api/session/${id}/interrupt`, { method: 'POST' }).catch(() => {})
    throw e
  } finally {
    call(`/api/session/${id}`, { method: 'DELETE' }).catch(() => {})
  }
}

/** Comprueba la conexión y devuelve los modelos gratuitos disponibles (primero el de por defecto). */
export async function listOpenCodeFreeModels(settings: OpenCodeSettings, f?: Fetch): Promise<string[]> {
  const call = client(settings, f)
  const r = await call('/api/model')
  const ids: string[] = (Array.isArray(r?.data) ? r.data : [])
    .filter((m: any) => m.providerID === 'opencode' && m.status !== 'deprecated' && m.enabled !== false)
    .filter((m: any) => (m.cost ?? []).every((c: any) => !c.input && !c.output))
    .filter((m: any) => (m.capabilities?.output ?? ['text']).includes('text'))
    .map((m: any) => m.id as string)
    .sort()
  if (!ids.length) throw new Error('OpenCode no ofrece modelos gratuitos en este momento.')
  return ids.includes(OPENCODE_DEFAULT_MODEL) ? [OPENCODE_DEFAULT_MODEL, ...ids.filter(i => i !== OPENCODE_DEFAULT_MODEL)] : ids
}
