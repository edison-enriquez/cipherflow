// Configuración de la IA, guardada solo en este navegador (localStorage). La API key nunca
// va a la URL ni al repositorio; solo viaja en la cabecera de las peticiones a Groq.
import { create } from 'zustand'
import { CLOUD, GROQ_DEFAULT_MODEL, LOCAL_PROVIDERS, VISIBLE_CLOUD, WEBLLM_MODELS, WEBNN_MODELS, cloudKey, isCloud, isFreeOpenRouter, webgpuAvailable, webnnAvailable, type AgentConfig } from './llm'

const KEY = 'cipherflow.ia'
export const DEFAULT_CONFIG: AgentConfig = { provider: 'groq', groqKey: '', groqModel: GROQ_DEFAULT_MODEL, openrouterModel: CLOUD.openrouter.defaultModel, qwenModel: CLOUD.qwen.defaultModel, webllmModel: WEBLLM_MODELS[0].id, webnnModel: WEBNN_MODELS[0].id, webnnDevice: 'npu' }

function load(): AgentConfig {
  try {
    const c: AgentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    // En OpenRouter solo se permiten modelos gratuitos: uno de pago guardado pasa al automático
    if (!isFreeOpenRouter(c.openrouterModel)) c.openrouterModel = CLOUD.openrouter.defaultModel
    // Quien tenía elegido un proveedor oculto (modelos locales, Alibaba) vuelve a Groq
    const local = c.provider === 'webllm' || c.provider === 'webnn'
    if (isCloud(c.provider) ? !VISIBLE_CLOUD.includes(c.provider) : !(LOCAL_PROVIDERS && local)) c.provider = 'groq'
    return c
  } catch { return DEFAULT_CONFIG }
}

/** ¿Hay un proveedor listo? Sin configurar, CipherFlow funciona igual pero sin funciones de IA. */
export const isConfigured = (c: AgentConfig) =>
  isCloud(c.provider) ? cloudKey(c).trim().length > 10 : c.provider === 'webnn' ? webnnAvailable() : webgpuAvailable()

interface AgentUI {
  config: AgentConfig
  /** El usuario activó la IA (con Groq basta la key; con WebLLM, elegirlo explícitamente). */
  enabled: boolean
  settingsOpen: boolean
  assistantOpen: boolean
  setConfig: (c: AgentConfig) => void
  setSettingsOpen: (v: boolean) => void
  setAssistantOpen: (v: boolean) => void
  /** Bloque adjunto al chat («Preguntar a la IA» sobre un bloque) */
  askBlock: { id: string; label: string } | null
  /** Abre el chat con ese bloque como contexto (null lo quita) */
  askAbout: (b: { id: string; label: string } | null) => void
}

export const useAgentStore = create<AgentUI>(set => {
  const config = load()
  return {
    config,
    enabled: (() => { try { return localStorage.getItem(KEY) !== null && isConfigured(config) } catch { return false } })(),
    settingsOpen: false,
    assistantOpen: false,
    setConfig: config => {
      try { localStorage.setItem(KEY, JSON.stringify(config)) } catch { /* sin almacenamiento */ }
      set({ config, enabled: isConfigured(config) })
    },
    setSettingsOpen: settingsOpen => set({ settingsOpen }),
    setAssistantOpen: assistantOpen => set({ assistantOpen }),
    askBlock: null,
    askAbout: askBlock => set(askBlock ? { askBlock, assistantOpen: true } : { askBlock }),
  }
})
