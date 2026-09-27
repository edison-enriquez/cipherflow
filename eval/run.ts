// Ejecuta el banco de evaluación con un modelo real y guarda el resultado en eval/results/.
//   GROQ_API_KEY=gsk_… npm run eval
//   OPENROUTER_API_KEY=sk-or-… npm run eval -- --provider openrouter --model auto:free
// Opciones: --provider groq|openrouter · --model <id> · --only id1,id2 · --rounds 3
// Las keys se leen del entorno y no se guardan en el resultado.
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadEngineNode } from './node'
import { BENCH_CASES } from '../src/agent/benchCases'
import { runBench } from '../src/agent/bench'
import { CLOUD, completeLLM, type AgentConfig, type CloudProvider } from '../src/agent/llm'

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf('--' + name)
  return i > 0 ? process.argv[i + 1] : def
}
const provider = arg('provider', 'groq') as CloudProvider
if (!(provider in CLOUD)) throw new Error(`Proveedor desconocido: ${provider}`)
const key = process.env[provider === 'groq' ? 'GROQ_API_KEY' : provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'QWEN_API_KEY']
if (!key) { console.error(`Falta la variable de entorno con la API key de ${CLOUD[provider].name}.`); process.exit(1) }
const model = arg('model', CLOUD[provider].defaultModel)!
const only = arg('only')?.split(',')
const cases = only ? BENCH_CASES.filter(c => only.includes(c.id)) : BENCH_CASES
const config: AgentConfig = {
  provider, groqKey: '', groqModel: '', webllmModel: '',
  ...(provider === 'groq' ? { groqKey: key, groqModel: model } : provider === 'openrouter' ? { openrouterKey: key, openrouterModel: model } : { qwenKey: key, qwenModel: model }),
}

await loadEngineNode()
const { catalog, executeFlow } = await import('../src/agent/runtime')
console.log(`Banco: ${cases.length} casos · ${CLOUD[provider].name} · ${model}\n`)
const { results, summary } = await runBench({
  cases, config, complete: completeLLM, catalog: catalog(), execute: executeFlow, maxRounds: Number(arg('rounds', '3')),
  onCase: (r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.correct ? '✓' : '✗'} ${r.id.padEnd(15)} rondas ${r.rounds} · llamadas ${r.calls} · ${(r.ms / 1000).toFixed(1)} s` +
    (r.correct ? '' : r.error ? `  error: ${r.error.slice(0, 90)}` : `  falta: ${r.missing.join(', ').slice(0, 60)}${r.selfSuccess ? ' (el agente lo dio por bueno)' : ''}`)) ||
    // Sin key válida o sin cuota diaria, seguir solo gastaría tiempo y ensuciaría la medición
    (r.error && /API key|límite diario|peticiones gratuitas de hoy/.test(r.error) ? (() => { throw new Error('Banco detenido: ' + r.error) })() : undefined),
})

console.log(`\nAcierto ${summary.accuracy} % · a la primera ${summary.firstTry} % · falso éxito ${summary.falseSuccess} % · ${summary.avgCalls} llamadas y ${(summary.avgMs / 1000).toFixed(1)} s por caso`)
for (const [k, v] of Object.entries(summary.byKind)) console.log(`  ${k.padEnd(13)} ${v.correct}/${v.cases}`)

mkdirSync('eval/results', { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const file = `eval/results/${stamp}_${provider}_${model.replace(/[^\w.-]+/g, '_')}.json`
writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), provider, model, summary, results }, null, 2))
console.log(`\nGuardado en ${file}`)
