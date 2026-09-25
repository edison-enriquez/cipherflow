# CipherFlow

Editor visual de flujos criptográficos por nodos, al estilo de n8n, que ejecuta las operaciones reales de [CyberChef](https://github.com/gchq/CyberChef). Está pensado para enseñar: además del resultado, muestra qué datos entran y salen de cada bloque y cómo funcionan por dentro las operaciones más usadas en clase.

**Demo:** https://edison-enriquez.github.io/cipherflow/

## Qué hace

- **Casi 500 operaciones de CyberChef** con sus mismos parámetros, agrupadas por categoría y con buscador. Quedan fuera los bloques de control de flujo (Fork, Merge, Jump…), porque en un grafo esa función la cumplen los cables. Magic sí está incluido.
- **Cables con datos visibles.** Cada cable muestra el tipo y el tamaño de lo que transporta (`string 64 B`, `ArrayBuffer 29 B`…). Al tocarlo se abre el bloque de destino con esos datos.
- **Modo paso a paso.** Recorre el flujo en orden: un pulso viaja por cada cable, el bloque activo se ilumina y un registro anota qué entró y qué salió en cada paso.
- **Vista de detalle (Entrada, Parámetros, Salida y Proceso).** Muestra los datos como texto, volcado hex o tabla de bytes, e indica cuándo CyberChef convierte el tipo del dato entre bloques.
- **Explicaciones internas verificadas.** Cada reconstrucción didáctica se compara con la salida real de CyberChef:
  - AES: relleno PKCS#7, modos ECB, CBC, CFB, OFB y CTR, y cada ronda con matrices 4×4.
  - SHA-256: relleno y las 64 rondas.
  - Base64, hex, binario, XOR, ROT13 y Vigenère.
- **Recetas de CyberChef.** Se puede importar una receta (el JSON de «Save recipe») para convertirla en cadena de bloques, y exportar la receta que lleva hasta el bloque seleccionado.

## Arquitectura

Vite + React + TypeScript + Tailwind, con los mismos tokens de diseño que [Codara](https://github.com/edison-enriquez/Codara). El lienzo usa [@xyflow/react](https://reactflow.dev) (React Flow 12) y el estado vive en un store de Zustand.

CyberChef no se empaqueta con la app. `engine/build.mjs` lo compila con esbuild en `public/engine/`, con **una entrada por operación** y el código compartido repartido en fragmentos. La app carga el núcleo al iniciar (tipos de datos y catálogo) y descarga cada operación la primera vez que un bloque la usa: un flujo de Base64 baja unos pocos KB y uno de AES, menos de 1 MB.

```
engine/                 Compilación del motor de CyberChef (esbuild → public/engine/)
src/engine/             Puente con el motor, catálogo en español y ejecución del grafo
src/canvas/             Lienzo de React Flow: bloques y cables con datos
src/detail/             Vista de detalle: entrada, parámetros, salida y proceso
src/explainers/         Explicaciones paso a paso (AES, SHA-256, Base64, XOR…)
src/lib/                Utilidades de bytes y las implementaciones didácticas de AES y SHA-256
src/state/              Store, ejecución automática y guardado en el navegador
src/io.ts               Ejemplos, importación y exportación
scripts/                Verificación del build y publicación en GitHub
```

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # compila el motor la primera vez y abre http://localhost:5173/cipherflow/
npm run build      # motor + typecheck + build de producción en dist/
npm run preview    # sirve dist/ en http://localhost:4173/cipherflow/
```

`npm run engine` recompila el motor, por ejemplo tras actualizar CyberChef.

Para agregar una explicación paso a paso a otra operación, crea el componente en `src/explainers/`, regístralo en `src/explainers/index.tsx` con el nombre exacto de la operación en CyberChef y añade ese nombre a `EXPLAINED` en `src/engine/catalog.ts` para que aparezca con ★.

## Publicación en GitHub Pages

Con la [CLI de GitHub](https://cli.github.com) y la sesión iniciada (`gh auth login`), un solo comando crea el repositorio, sube el código, activa Pages con GitHub Actions y lanza el primer despliegue:

```bash
npm run publicar            # o: bash scripts/publicar.sh [nombre-del-repo] [public|private]
```

La página queda en `https://<usuario>.github.io/cipherflow/`. Desde entonces, cada push a `main` la reconstruye y la vuelve a publicar (`.github/workflows/deploy.yml`); los pull requests solo se compilan y verifican (`ci.yml`).

Si el repositorio tiene otro nombre, cambia `base` en `vite.config.ts` y la ruta que revisa `scripts/check-dist.mjs`.

## Licencia

CipherFlow se distribuye bajo la [licencia Apache 2.0](LICENSE), la misma de CyberChef. Las operaciones son de CyberChef, © Crown Copyright; los avisos de atribución están en [`NOTICE`](NOTICE).
