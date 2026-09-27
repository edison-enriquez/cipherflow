// Motor de CyberChef en Node (el mismo que usa la app, compilado en public/engine/), para el
// banco de evaluación. Fuera de src/ porque usa APIs de Node.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEngine } from '../src/engine/cyberchef'

export async function loadEngineNode() {
  const dir = resolve('public/engine')
  if (!existsSync(resolve(dir, 'manifest.json'))) throw new Error('Falta el motor compilado: ejecuta «npm run engine».')
  // Algunas dependencias de CyberChef (forge) buscan window/self al cargarse
  const g = globalThis as any
  g.window ??= g
  g.self ??= g
  // Un ejemplo de la app (petición HTTP en vivo) lee location al cargarse
  g.location ??= new URL('http://localhost/')
  await loadEngine({ base: pathToFileURL(dir).href + '/', readJSON: async u => JSON.parse(await readFile(new URL(u), 'utf8')) })
}
