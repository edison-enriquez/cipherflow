// Conversaciones con el asistente, guardadas en IndexedDB con índice por flujo. Cada flujo tiene
// sus hilos; «Mis flujos» (sin flujo abierto) usa la clave HOME.
import type { ChatThread } from '../agent/chat'
import { newId, req, tx } from './db'

export const HOME = '__inicio'

export async function listThreads(flowKey: string): Promise<ChatThread[]> {
  try {
    const all = await tx(['chats'], 'readonly', t => req(t.objectStore('chats').index('flowKey').getAll(flowKey) as IDBRequest<ChatThread[]>))
    return all.sort((a, b) => b.updated - a.updated)
  } catch { return [] }
}

export async function saveThread(th: ChatThread) {
  try { await tx(['chats'], 'readwrite', t => { t.objectStore('chats').put(th) }) } catch { /* sin almacenamiento: el chat sigue en memoria */ }
}

export async function deleteThread(id: string) {
  try { await tx(['chats'], 'readwrite', t => { t.objectStore('chats').delete(id) }) } catch { /* nada que borrar */ }
}

export async function deleteThreadsOfFlow(flowKey: string) {
  for (const th of await listThreads(flowKey)) await deleteThread(th.id)
}

export const newThread = (flowKey: string): ChatThread => ({ id: newId('c'), flowKey, title: 'Conversación nueva', created: Date.now(), updated: Date.now(), messages: [] })
