import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
})

async function loadConfig(saved: object) {
  store.set('cipherflow.ia', JSON.stringify(saved))
  vi.resetModules()
  const { useAgentStore } = await import('../config')
  return useAgentStore.getState().config
}

describe('configuración de IA', () => {
  beforeEach(() => store.clear())

  it('OpenRouter usa por defecto el modo automático (todos los gratuitos)', async () => {
    expect((await loadConfig({})).openrouterModel).toBe('auto:free')
  })

  it('un modelo de pago guardado pasa al automático, aunque haya key', async () => {
    const c = await loadConfig({ openrouterKey: 'sk-or-1234567890', openrouterModel: 'qwen/qwen3.8-flash' })
    expect(c.openrouterModel).toBe('auto:free')
  })

  it('conserva un modelo gratuito elegido', async () => {
    expect((await loadConfig({ openrouterModel: 'qwen/qwen3.8-27b:free' })).openrouterModel).toBe('qwen/qwen3.8-27b:free')
    expect((await loadConfig({ openrouterModel: 'openrouter/free' })).openrouterModel).toBe('openrouter/free')
  })
})

describe('OpenRouter solo gratuitos', () => {
  const free = (id: string) => ({ id, pricing: { prompt: '0', completion: '0' } })
  const catalog = [
    free('google/gemma-4-31b-it:free'), free('qwen/qwen3.8-27b:free'), free('a/tercero:free'), free('openrouter/free'),
    { id: 'qwen/qwen3.8-flash', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
    free('stealth/space-bunny-alpha'), free('nvidia/nemotron-3.5-content-safety:free'),
    { ...free('google/lyria-3-pro-preview'), architecture: { output_modalities: ['audio'] } },
  ]
  const cfg = (openrouterModel: string) => ({ provider: 'openrouter' as const, groqKey: '', groqModel: '', openrouterKey: 'sk-or-1234567890', openrouterModel, webllmModel: '' })
  const json = (body: object, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })
  const upstream = (id: string) => json({ error: { message: `${id} is temporarily rate-limited upstream`, metadata: { raw: '…' } } }, 429)
  let realFetch: typeof fetch
  let asked: string[]
  /** Simula OpenRouter: `reply(model)` decide la respuesta de cada modelo */
  async function setup(reply: (model: string) => Response) {
    realFetch = globalThis.fetch
    asked = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return json({ data: catalog })
      if (url.endsWith('/key')) return json({ data: {} })
      const b = JSON.parse(String(init?.body))
      asked.push(b.model)
      return reply(b.model)
    }))
    const llm = await import('../llm')
    llm.resetFreeRotation()
    return llm
  }
  afterEach(() => vi.stubGlobal('fetch', realFetch))
  const ok = (text = 'ok') => json({ choices: [{ message: { content: text } }] })

  it('lista el automático y solo los gratuitos de chat', async () => {
    const { listCloudModels } = await setup(() => ok())
    expect(await listCloudModels('openrouter', 'sk-or-1234567890'))
      .toEqual(['auto:free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'openrouter/free', 'a/tercero:free'])
  })

  it('un modelo fijo lleva el respaldo gratuito de OpenRouter', async () => {
    const { completeLLM } = await setup(() => ok())
    const bodies: any[] = []
    ;(globalThis.fetch as any).mockImplementation(async (_u: string, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return ok() })
    await completeLLM(cfg('qwen/qwen3.8-27b:free'), [{ role: 'user', content: 'hola' }])
    expect(bodies[0].models).toEqual(['qwen/qwen3.8-27b:free', 'openrouter/free'])
  })

  it('automático: salta los saturados, caídos o vacíos y sigue con el que respondió', async () => {
    const { completeLLM } = await setup(m =>
      m === 'google/gemma-4-31b-it:free' ? upstream(m)
        : m === 'qwen/qwen3.8-27b:free' ? json({ error: { message: 'No endpoints found' } }, 404)
          : m === 'a/tercero:free' && asked.length < 4 ? ok('  ') : ok(`hola desde ${m}`))
    const steps: string[] = []
    const out = await completeLLM(cfg('auto:free'), [{ role: 'user', content: 'hola' }], { onProgress: p => steps.push(p.text) })
    expect(out).toBe('hola desde openrouter/free')
    expect(asked).toEqual(['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'a/tercero:free', 'openrouter/free'])
    expect(steps.at(-1)).toMatch(/probando openrouter\/free \(4\/4\)/)
    // La siguiente llamada empieza por el último que respondió
    asked.length = 0
    await completeLLM(cfg('auto:free'), [{ role: 'user', content: 'otra' }])
    expect(asked[0]).toBe('openrouter/free')
  })

  it('automático: el límite diario de la cuenta corta la rotación', async () => {
    const { completeLLM } = await setup(() => json({ error: { message: 'Rate limit exceeded: free-models-per-day' } }, 429))
    await expect(completeLLM(cfg('auto:free'), [{ role: 'user', content: 'hola' }])).rejects.toThrow(/50 peticiones gratuitas de hoy/)
    expect(asked).toHaveLength(1)
  })

  it('automático: si ninguno responde, lo dice', async () => {
    const { completeLLM } = await setup(m => upstream(m))
    await expect(completeLLM(cfg('auto:free'), [{ role: 'user', content: 'hola' }])).rejects.toThrow(/ninguno de los 4 modelos gratuitos/)
    expect(asked).toHaveLength(4)
  })
})

describe('límites de OpenRouter', () => {
  const res = (h: Record<string, string> = {}) => new Response('{}', { status: 429, headers: h })
  it('distingue límite diario, por minuto y saturación del proveedor', async () => {
    const { rateLimitMessage } = await import('../llm')
    const reset = String(Date.now() + 3 * 3600_000)
    expect(rateLimitMessage('openrouter', 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', {}, res({ 'X-RateLimit-Reset': reset })))
      .toMatch(/50 peticiones gratuitas de hoy.*Se renuevan a las/)
    expect(rateLimitMessage('openrouter', 'Rate limit exceeded: free-models-per-min.', {}, res())).toMatch(/por minuto.*20 peticiones/)
    const upstream = { error: { message: 'google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly.', metadata: { raw: '…', provider_name: 'Google AI Studio' } } }
    expect(rateLimitMessage('openrouter', upstream.error.message, upstream, res())).toMatch(/saturado en su proveedor \(Google AI Studio\)/)
    expect(rateLimitMessage('groq', 'Limit 100000, Used 99999 on tokens per day (TPD)', {}, res())).toMatch(/límite diario/)
  })
})

describe('modelos locales ocultos', () => {
  beforeEach(() => store.clear())
  it('quien tenía WebLLM o WebNN elegido pasa a un proveedor en la nube', async () => {
    expect((await loadConfig({ provider: 'webllm' })).provider).toBe('groq')
    expect((await loadConfig({ provider: 'webnn' })).provider).toBe('groq')
    expect((await loadConfig({ provider: 'openrouter' })).provider).toBe('openrouter')
  })
})

describe('Alibaba oculto', () => {
  beforeEach(() => store.clear())
  it('quien tenía Qwen (Alibaba) elegido pasa a Groq sin perder la key', async () => {
    const c = await loadConfig({ provider: 'qwen', qwenKey: 'sk-1234567890ab' })
    expect(c.provider).toBe('groq')
    expect(c.qwenKey).toBe('sk-1234567890ab')
  })
})
