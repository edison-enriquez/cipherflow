// Configuración de la IA, guardada solo en este navegador (localStorage). La API key nunca
// va a la URL ni al repositorio; solo viaja en la cabecera de las peticiones a Groq.
import { create } from 'zustand'
import { GROQ_DEFAULT_MODEL, WEBLLM_MODELS, webgpuAvailable, type AgentConfig } from './llm'

const KEY = 'cipherflow.ia'
export const DEFAULT_CONFIG: AgentConfig = { provider: 'groq', groqKey: '', groqModel: GROQ_DEFAULT_MODEL, webllmModel: WEBLLM_MODELS[0].id }

function load(): AgentConfig {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULT_CONFIG }
}

/** ¿Hay un proveedor listo? Sin configurar, CipherFlow funciona igual pero sin funciones de IA. */
export const isConfigured = (c: AgentConfig) => c.provider === 'groq' ? c.groqKey.trim().length > 10 : webgpuAvailable()

interface AgentUI {
  config: AgentConfig
  /** El usuario activó la IA (con Groq basta la key; con WebLLM, elegirlo explícitamente). */
  enabled: boolean
  settingsOpen: boolean
  assistantOpen: boolean
  setConfig: (c: AgentConfig) => void
  setSettingsOpen: (v: boolean) => void
  setAssistantOpen: (v: boolean) => void
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
  }
})
