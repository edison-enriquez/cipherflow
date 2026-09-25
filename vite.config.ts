import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El motor de CyberChef se compila aparte (engine/build.mjs) en public/engine/
// y la app lo importa en tiempo de ejecución, operación por operación.
export default defineConfig({
  // Se sirve en la raíz del dominio propio (cipherflow.eehub.ing).
  base: '/',
  plugins: [react()],
  build: { target: 'es2022' },
})
