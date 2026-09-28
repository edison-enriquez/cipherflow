import { describe, expect, it } from 'vitest'
import { OPENCODE_AGENT, finalText, installCommand, listOpenCodeFreeModels, openCodeComplete, serveCommand, toTranscript } from '../opencode'

const settings = { url: 'http://127.0.0.1:4096', password: 'secreto123' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

/** Servidor falso de OpenCode: responde al prompt tras `polls` consultas con los mensajes dados */
function fakeServer(reply: () => any[], polls = 2) {
  const calls: { path: string; method: string; body?: any; auth?: string }[] = []
  let n = 0
  const f = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace('http://127.0.0.1:4096', '')
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as any)?.Authorization })
    if (path === '/api/session' && init.method === 'POST') return json({ data: { id: 'ses_1' } })
    if (path.endsWith('/prompt')) return json({ data: { admittedSeq: 1 } })
    if (path.includes('/message')) return json({ data: ++n < polls ? [{ type: 'user', text: 'x' }] : reply() })
    return json({ data: true })
  }) as typeof fetch
  return { f, calls }
}
const assistant = (content: any[], extra: object = {}) => ({ type: 'assistant', time: { created: 1, completed: 2 }, finish: 'stop', content, ...extra })

describe('OpenCode local', () => {
  it('crea la sesión con el agente sin herramientas, espera y devuelve solo el texto final', async () => {
    const { f, calls } = fakeServer(() => [
      { type: 'user', text: 'pedido' },
      assistant([{ type: 'reasoning', text: 'pienso…' }, { type: 'text', text: '{"ok":' }, { type: 'text', text: ' true}' }]),
    ])
    const out = await openCodeComplete({ settings, model: 'big-pickle', json: true, fetch: f, messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] })
    expect(out).toBe('{"ok": true}')
    expect(calls[0]).toMatchObject({ path: '/api/session', method: 'POST', body: { agent: OPENCODE_AGENT, model: { providerID: 'opencode', id: 'big-pickle' } } })
    expect(calls[0].auth).toBe('Basic ' + btoa('opencode:secreto123'))
    expect(calls[1].body.prompt.text).toContain('Responde SOLO con JSON')
    expect(calls.at(-1)).toMatchObject({ path: '/api/session/ses_1', method: 'DELETE' })
  })

  it('no da por terminada una respuesta que solo pidió herramientas', () => {
    expect(finalText({ data: [assistant([{ type: 'tool', name: 'read' }], { finish: 'tool-calls' })] })).toEqual({ done: false })
    expect(finalText({ data: [assistant([{ type: 'text', text: 'a' }], { time: { created: 1 } })] })).toEqual({ done: false })
  })

  it('explica el FreeTierError y el tiempo agotado', async () => {
    const free = fakeServer(() => [assistant([], { error: { message: "OpenCode's free tier can only be used from within OpenCode" } })])
    await expect(openCodeComplete({ settings, model: 'big-pickle', fetch: free.f, messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/FreeTierError/)
    const slow = fakeServer(() => [{ type: 'user', text: 'x' }], 1e9)
    await expect(openCodeComplete({ settings, model: 'lento', timeout: 50, fetch: slow.f, messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/no respondió/)
    expect(slow.calls.at(-1)?.method).toBe('DELETE')
  })

  it('al cancelar interrumpe la sesión en el servidor', async () => {
    const { f, calls } = fakeServer(() => [{ type: 'user', text: 'x' }], 1e9)
    const ctl = new AbortController()
    const p = openCodeComplete({ settings, model: 'm', fetch: f, signal: ctl.signal, messages: [{ role: 'user', content: 'x' }] })
    setTimeout(() => ctl.abort(), 30)
    await expect(p).rejects.toThrow(/Abort/)
    await new Promise(r => setTimeout(r, 10))
    expect(calls.some(c => c.path.endsWith('/interrupt'))).toBe(true)
  })

  it('contraseña incorrecta y servidor apagado dan mensajes claros', async () => {
    const f401 = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    await expect(openCodeComplete({ settings, model: 'm', fetch: f401, messages: [] })).rejects.toThrow(/contraseña/)
    const down = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect(openCodeComplete({ settings, model: 'm', fetch: down, messages: [] })).rejects.toThrow(/no hay servidor/)
  })

  it('lista solo los modelos gratuitos de OpenCode, con big-pickle primero', async () => {
    const f = (async () => json({ data: [
      { id: 'zeta-free', providerID: 'opencode', cost: [{ input: 0, output: 0 }] },
      { id: 'big-pickle', providerID: 'opencode', cost: [{ input: 0, output: 0 }] },
      { id: 'claude-sonnet-5', providerID: 'opencode', cost: [{ input: 3, output: 15 }] },
      { id: 'otro', providerID: 'opencode-go', cost: [{ input: 0, output: 0 }] },
    ] })) as unknown as typeof fetch
    expect(await listOpenCodeFreeModels(settings, f)).toEqual(['big-pickle', 'zeta-free'])
  })

  it('el comando de arranque lleva contraseña, CORS y el agente sin herramientas', () => {
    const ps = serveCommand({ shell: 'powershell', runner: 'npx', password: 'abc12345', origin: 'https://cipherflow.eehub.ing' })
    expect(ps).toContain("$env:OPENCODE_SERVER_PASSWORD='abc12345'")
    expect(ps).toContain('--cors https://cipherflow.eehub.ing')
    expect(ps).toContain('--port 4096')
    const cfg = JSON.parse(/OPENCODE_CONFIG_CONTENT='([^']+)'/.exec(ps)![1])
    expect(cfg.agent[OPENCODE_AGENT]).toMatchObject({ tools: { '*': false }, permission: { '*': 'deny' } })
    expect(serveCommand({ shell: 'bash', runner: 'npx', password: 'abc12345', origin: 'http://localhost:5173' })).toMatch(/^OPENCODE_SERVER_PASSWORD='abc12345' OPENCODE_CONFIG_CONTENT='\{.*\}' npx -y opencode-ai serve/)
  })

  it('con el CLI instalado usa «opencode» directamente, y ofrece cómo instalarlo', () => {
    const cli = serveCommand({ shell: 'powershell', runner: 'cli', password: 'abc12345', origin: 'https://x.dev' })
    expect(cli).toMatch(/; opencode serve --hostname 127\.0\.0\.1 --port 4096 --cors https:\/\/x\.dev$/)
    expect(cli).not.toContain('npx')
    expect(serveCommand({ shell: 'bash', runner: 'cli', password: 'p', origin: 'https://x.dev', url: 'http://127.0.0.1:5000' })).toMatch(/' opencode serve --hostname 127\.0\.0\.1 --port 5000 /)
    expect(installCommand('powershell')).toBe('npm install -g opencode-ai')
    expect(installCommand('bash')).toContain('opencode.ai/install')
  })

  it('une la conversación en un solo texto', () => {
    expect(toTranscript([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }, { role: 'assistant', content: 'A' }]))
      .toBe('Instrucciones:\nS\n\nUsuario:\nU\n\nAsistente:\nA')
  })
})
