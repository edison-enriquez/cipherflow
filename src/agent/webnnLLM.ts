// LLM en la NPU con WebNN (W3C) sobre ONNX Runtime Web, siguiendo el método de la demo
// «WebNN Chat» de Microsoft/Intel: WebNN no admite formas dinámicas, así que se crean
// dos sesiones con dimensiones fijas —prefill (todo el prompt, rellenado hasta maxLength)
// y decode (un token)— y la caché KV vive en tensores de la NPU (MLTensor) de tamaño fijo.
// Los modelos son los de ORT GenAI preparados para WebNN (int4, GroupQueryAttention).

export interface NpuModel {
  id: string
  label: string
  /** Carpeta en Hugging Face con model.onnx y model.onnx.data */
  base: string
  /** Repositorio del que se lee el tokenizador */
  tokenizer: string
  layers: number
  kvHeads: number
  headSize: number
  vocab: number
  eos: number[]
  /** Tamaño aproximado de la descarga, en GB */
  size: number
}

const HF = 'https://huggingface.co/'
export const NPU_MODELS: NpuModel[] = [
  { id: 'qwen2-0.5b', label: 'Qwen2 0.5B', base: HF + 'webnn/Qwen2-0.5B-Instruct-onnx/resolve/main/', tokenizer: 'webnn/Qwen2-0.5B-Instruct-onnx',
    layers: 24, kvHeads: 2, headSize: 64, vocab: 151936, eos: [151645, 151643], size: 0.56 },
  { id: 'phi-4-mini', label: 'Phi-4 mini 3.8B', base: HF + 'webnn/Phi-4-mini-instruct-onnx-webnn/resolve/main/onnx/', tokenizer: 'webnn/Phi-4-mini-instruct-onnx-webnn',
    layers: 32, kvHeads: 8, headSize: 128, vocab: 200064, eos: [200020, 199999], size: 2.5 },
]

export interface NpuProgress { progress: number; text: string }

// ONNX Runtime Web (con el proveedor WebNN) se carga desde el CDN solo al usar la NPU:
// así el sitio publicado no arrastra ~55 MB de .wasm que la mayoría no usará.
export const ORT_VERSION = '1.30.0'
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.all.bundle.min.mjs`

/** Tokenizador (tokenizers.js) + plantilla de chat (jinja) del modelo. */
async function loadTokenizer(repo: string) {
  const [{ Tokenizer }, { Template }] = await Promise.all([import('@huggingface/tokenizers'), import('@huggingface/jinja')])
  const get = (f: string) => fetch(`${HF}${repo}/resolve/main/${f}`).then(r => { if (!r.ok) throw new Error(`No se pudo leer ${f} (HTTP ${r.status}).`); return r.json() })
  const [json, config] = await Promise.all([get('tokenizer.json'), get('tokenizer_config.json')])
  const tok = new Tokenizer(json, config)
  const tpl = new Template(config.chat_template)
  const special = (t: any) => (typeof t === 'string' ? t : t?.content ?? '')
  return {
    encode: (messages: { role: string; content: string }[]) =>
      tok.encode(tpl.render({ messages, add_generation_prompt: true, bos_token: special(config.bos_token), eos_token: special(config.eos_token) }), { add_special_tokens: false }).ids as number[],
    decode: (ids: number[]) => tok.decode(ids, { skip_special_tokens: true }) as string,
  }
}

const CACHE = 'cipherflow-modelos'
// Float16Array (Chrome 135+) aún no está en los tipos de TypeScript
const F16: new (n: number) => ArrayLike<number> = (globalThis as any).Float16Array

/** Descarga con progreso; queda en la Cache API para no volver a bajarlo. */
async function fetchModelFile(url: string, onBytes: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  let cache: Cache | null = null
  try { cache = await caches.open(CACHE) } catch { /* sin caché: se descarga cada vez */ }
  const hit = await cache?.match(url).catch(() => undefined)
  if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onBytes(b.byteLength, b.byteLength); return b }
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar ${url.split('/').pop()} (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const out = total ? new Uint8Array(total) : null
  const parts: Uint8Array[] = []
  let loaded = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (out && loaded + value.byteLength <= out.byteLength) out.set(value, loaded); else parts.push(value)
    loaded += value.byteLength
    onBytes(loaded, total || loaded)
  }
  let bytes = out && loaded === out.byteLength ? out : null
  if (!bytes) { bytes = new Uint8Array(loaded); let o = 0; for (const p of (out ? [out.subarray(0, Math.min(loaded, out.byteLength)), ...parts] : parts)) { bytes.set(p, o); o += p.byteLength } }
  try { await cache?.put(url, new Response(bytes)) } catch { /* cuota llena: se usa sin guardar */ }
  return bytes
}

/** ¿El modelo ya está descargado en este navegador? */
export async function npuModelCached(m: NpuModel): Promise<boolean> {
  try { const c = await caches.open(CACHE); return !!(await c.match(m.base + 'model.onnx.data')) } catch { return false }
}

export class NpuLLM {
  private ort: any
  private ctx: any
  private prefill: any
  private decode: any
  private tok: any
  private feed: Record<string, any> = {}
  private fetches: Record<string, any> = {}
  private busy: Promise<unknown> = Promise.resolve()

  constructor(readonly model: NpuModel, readonly device: 'npu' | 'gpu', readonly maxLength: number) {}

  async load(onProgress?: (p: NpuProgress) => void, signal?: AbortSignal) {
    const m = this.model
    onProgress?.({ progress: 0, text: 'Cargando ONNX Runtime Web y el tokenizador…' })
    const [ort, tok] = await Promise.all([import(/* @vite-ignore */ ORT_URL), loadTokenizer(m.tokenizer)])
    this.ort = ort
    ort.env.logLevel = 'error'
    this.tok = tok

    const sizes: Record<string, [number, number]> = {}
    const report = (f: string) => (l: number, t: number) => {
      sizes[f] = [l, t]
      const L = Object.values(sizes).reduce((a, [x]) => a + x, 0), Tt = Object.values(sizes).reduce((a, [, y]) => a + y, 0)
      onProgress?.({ progress: Tt ? 0.9 * L / Tt : 0, text: `Descargando ${m.label} · ${(L / 1e6).toFixed(0)} de ${(Math.max(Tt, m.size * 1e9) / 1e6).toFixed(0)} MB` })
    }
    const [graph, data] = await Promise.all([
      fetchModelFile(m.base + 'model.onnx', report('g'), signal),
      fetchModelFile(m.base + 'model.onnx.data', report('d'), signal),
    ])
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    this.ctx = await (navigator as any).ml.createContext({ deviceType: this.device })
    const options = (seq: number) => ({
      executionProviders: [{ name: 'webnn', deviceType: this.device, context: this.ctx }],
      externalData: [{ data, path: 'model.onnx.data' }],
      freeDimensionOverrides: { batch_size: 1, sequence_length: seq, total_sequence_length: this.maxLength, past_sequence_length: this.maxLength },
    })
    onProgress?.({ progress: 0.92, text: `Compilando ${m.label} para la ${this.device.toUpperCase()} (prefill)…` })
    this.prefill = await ort.InferenceSession.create(graph, options(this.maxLength) as any)
    onProgress?.({ progress: 0.97, text: `Compilando ${m.label} para la ${this.device.toUpperCase()} (decode)…` })
    this.decode = await ort.InferenceSession.create(graph, options(1) as any)

    // Caché KV fija en tensores de WebNN (se reutiliza entre llamadas)
    const kv = [1, m.kvHeads, this.maxLength, m.headSize]
    for (let i = 0; i < m.layers; i++) for (const k of ['key', 'value']) {
      this.feed[`past_key_values.${i}.${k}`] = await this.tensor(kv, false)
      this.fetches[`present.${i}.${k}`] = await this.tensor(kv, false)
    }
    onProgress?.({ progress: 1, text: `${m.label} listo en la ${this.device.toUpperCase()}` })
  }

  private async tensor(dims: number[], readable: boolean) {
    const t = await this.ctx.createTensor({ dataType: 'float16', shape: dims, writable: false, readable })
    return this.ort.Tensor.fromMLTensor(t, { dataType: 'float16', dims })
  }

  private swapKv() {
    for (let i = 0; i < this.model.layers; i++) for (const k of ['key', 'value']) {
      const a = this.feed[`past_key_values.${i}.${k}`]
      this.feed[`past_key_values.${i}.${k}`] = this.fetches[`present.${i}.${k}`]
      this.fetches[`present.${i}.${k}`] = a
    }
  }

  /** Tokens del prompt con la plantilla de chat del modelo. */
  encode(messages: { role: string; content: string }[]): number[] {
    return this.tok.encode(messages)
  }

  /** Generación voraz (argmax), una a la vez. */
  generate(ids: number[], maxNew: number, opts: { signal?: AbortSignal; onToken?: (n: number) => void } = {}): Promise<string> {
    const run = this.busy.then(() => this.run(ids, maxNew, opts))
    this.busy = run.catch(() => {})
    return run
  }

  private async run(ids: number[], maxNew: number, { signal, onToken }: { signal?: AbortSignal; onToken?: (n: number) => void }) {
    const { ort } = this, V = this.model.vocab, L = this.maxLength
    const n = ids.length
    if (n >= L - 16) throw new Error(`El pedido ocupa ${n} tokens y el modelo local admite ${L}. Acórtalo o usa Groq.`)
    const pad = (a: bigint[]) => a.concat(Array(L - a.length).fill(0n))
    const attn = pad(Array(n).fill(1n))
    this.feed.input_ids = new ort.Tensor('int64', BigInt64Array.from(pad(ids.map(BigInt))), [1, L])
    this.feed.attention_mask = new ort.Tensor('int64', BigInt64Array.from(attn), [1, L])
    this.feed.position_ids = new ort.Tensor('int64', BigInt64Array.from(pad(ids.map((_, i) => BigInt(i)))), [1, L])

    // Prefill: los logits salen para las L posiciones; interesa la última del prompt
    const logits = await this.tensor([1, L, V], true)
    this.fetches.logits = logits
    await this.prefill.run(this.feed, this.fetches)
    const all = new F16(L * V)
    await this.ctx.readTensor(logits.mlTensor, all)
    logits.mlTensor.destroy()
    let last = argmax(all, (n - 1) * V, V)
    this.swapKv()

    const out = [last]
    const step = await this.tensor([1, 1, V], true)
    this.fetches.logits = step
    const buf = new F16(V)
    let pos = n
    try {
      while (!this.model.eos.includes(last) && out.length < maxNew && pos < L) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        this.feed.input_ids = new ort.Tensor('int64', BigInt64Array.from([BigInt(last)]), [1, 1])
        attn[pos] = 1n
        this.feed.attention_mask = new ort.Tensor('int64', BigInt64Array.from(attn), [1, L])
        this.feed.position_ids = new ort.Tensor('int64', BigInt64Array.from([BigInt(pos)]), [1, 1])
        await this.decode.run(this.feed, this.fetches)
        await this.ctx.readTensor(step.mlTensor, buf)
        last = argmax(buf, 0, V)
        out.push(last)
        this.swapKv()
        pos++
        onToken?.(out.length)
        // Un objeto JSON completo: no hace falta seguir generando
        if (out.length % 8 === 0 && jsonClosed(this.tok.decode(out))) break
      }
    } finally { step.mlTensor.destroy(); this.fetches.logits = undefined }
    return this.tok.decode(out)
  }
}

function argmax(a: ArrayLike<number>, off: number, n: number) {
  let m = -Infinity, j = 0
  for (let i = 0; i < n; i++) { const v = a[off + i]; if (v > m) { m = v; j = i } }
  return j
}

/** ¿El texto ya contiene un objeto JSON balanceado completo? */
export function jsonClosed(s: string): boolean {
  const i = s.indexOf('{')
  if (i < 0) return false
  let d = 0, q = false, e = false
  for (let k = i; k < s.length; k++) {
    const c = s[k]
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue }
    if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) return true
  }
  return false
}
