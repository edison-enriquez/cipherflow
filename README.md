# CipherFlow

Editor visual de flujos criptográficos por nodos, al estilo de n8n, que ejecuta las operaciones reales de [CyberChef 11.5.0](https://github.com/gchq/CyberChef). Pensado para enseñar: además del resultado, muestra qué datos entran y salen de cada bloque y cómo funcionan por dentro las operaciones más usadas en clase.

**Demo:** https://cipherflow.eehub.ing/
**Versión:** 3.0.0 · **Stack:** Vite 5 + React 18 + TypeScript 5 + Tailwind 3 + [@xyflow/react](https://reactflow.dev) 12 + Zustand 4

## Qué hace

- **Operaciones reales de CyberChef** con sus mismos parámetros, agrupadas por categoría en español y con buscador. Quedan fuera 9 bloques de control de flujo (`Fork`, `Merge`, `Jump`, `Conditional Jump`, `Return`, `Subsection`, `Register`, `Label`, `Comment`), porque en un grafo esa función la cumplen los cables. `Magic` sí está incluido. La lista de populares incluye Base64, Hex, AES, XOR, SHA2, ROT13, Magic, Binary, Vigenère, Gunzip y URL Decode.
- **4 bloques propios de flujo:** Entrada (texto/hex/Base64/archivo), Salida, XOR de dos flujos y Unir flujos.
- **Cables con datos visibles.** Cada cable muestra tipo y tamaño (`string 64 B`, `ArrayBuffer 29 B`…). Al tocarlo se abre el bloque de destino con esos datos.
- **Ejecución automática + modo paso a paso.** El grafo se reejecuta al cambiar nodos, aristas o parámetros; el modo paso a paso recorre el flujo en orden topológico con pulso animado, bloque activo iluminado y registro de qué entró/salió en cada paso.
- **Vista de detalle (Entrada, Parámetros, Salida y Proceso).** Datos como texto, volcado hex o tabla de bytes; indica conversiones de tipo de CyberChef entre bloques. Los parámetros son los controles nativos de cada operación (los mismos de CyberChef).
- **Explicaciones internas verificadas (★, 12 operaciones).** Cada reconstrucción didáctica se compara con la salida real de CyberChef:
  - AES Encrypt/Decrypt: relleno PKCS#7, modos ECB, CBC, CFB, OFB y CTR, rondas con matrices 4×4.
  - SHA2 (SHA-256): relleno y las 64 rondas.
  - To/From Base64, To/From Hex, To Binary, XOR, ROT13, Vigenère Encode/Decode.
- **Recetas de CyberChef.** Importa una receta (JSON de «Save recipe») como cadena de bloques y exporta la receta que lleva hasta el bloque seleccionado (siguiendo la entrada 1). También importa/exporta flujos propios en JSON.
- **15 ejemplos en dos grupos** (menú **Ejemplos**):
  - *Criptografía:* AES-CBC por dentro, ECB revela patrones, Base64 bit a bit, SHA-256 y HMAC, XOR ida y vuelta, One-time pad con dos flujos, Magic, y ROT13/Vigenère.
  - *Redes:* anatomía de una petición HTTP (URL, User-Agent y credenciales Basic en claro), petición HTTP en vivo, consulta DNS en vivo (DoH), paquete DNS capa por capa (Ethernet → IPv4 → UDP → DNS), three-way handshake TCP, subredes IP y ClientHello TLS con huella JA3. Los dos ejemplos «en vivo» hacen peticiones reales desde el navegador.
- **Persistencia local, temas claro/oscuro, paleta con buscador y panel de registro.** Diseño responsive (paleta como drawer en móvil).

## Arquitectura

CyberChef no se empaqueta con la app. `engine/build.mjs` lo compila con esbuild en `public/engine/`, con **una entrada por operación** y el código compartido en fragmentos. La app carga el núcleo al iniciar (tipos de datos y catálogo) y descarga cada operación la primera vez que un bloque la usa: un flujo de Base64 baja unos pocos KB y uno de AES, menos de 1 MB.

```
engine/                 Compilación del motor CyberChef (esbuild → public/engine/)
src/engine/             Puente con el motor (cyberchef.ts), catálogo en español (catalog.ts),
                        ejecución del grafo (graph.ts) y tipos (types.ts)
src/canvas/             Lienzo @xyflow/react: Canvas.tsx, bloques (OpNode.tsx) y cables (DataEdge.tsx)
src/detail/             Vista de detalle: NodeDetail.tsx, Params.tsx, DataView.tsx, Process.tsx
src/explainers/         Explicaciones paso a paso: aes.tsx, sha256.tsx, encodings.tsx, classic.tsx
src/lib/                bytes.ts, e implementaciones didácticas aes.ts y sha256.ts
src/state/              store.ts (Zustand), runner.ts (auto-ejecución, paso a paso, persistencia localStorage)
src/components/         Header, Palette, Transport, LogPanel, Toast, IODialog, ui.tsx
src/hooks/              useTheme.ts (tema + media queries)
src/io.ts               ejemplos de criptografía, importación (flujos + recetas) y exportación
src/examples.redes.ts   ejemplos de redes (paquetes de muestra con checksums válidos)
scripts/                check-dist.mjs (verificación del build) y publicar.sh (deploy)
.github/workflows/      ci.yml (verifica PRs) y deploy.yml (publica a Pages en cada push a main)
```

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # compila el motor si falta (predev) y abre http://localhost:5173/
npm run build      # motor + typecheck + build de producción en dist/
npm run preview    # sirve dist/ en http://localhost:4173/
npm run typecheck  # solo verificación de tipos
```

`npm run engine` recompila el motor, por ejemplo tras actualizar CyberChef.

Para agregar una explicación paso a paso a otra operación, crea el componente en `src/explainers/`, regístralo en `src/explainers/index.tsx` con el nombre exacto de la operación en CyberChef y añade ese nombre a `EXPLAINED` en `src/engine/catalog.ts` para que aparezca con ★.

## Publicación en GitHub Pages

Con la [CLI de GitHub](https://cli.github.com) y la sesión iniciada (`gh auth login`):

```bash
npm run publicar            # o: bash scripts/publicar.sh [nombre-del-repo] [public|private]
```

Desde entonces, cada push a `main` la reconstruye y la vuelve a publicar (`.github/workflows/deploy.yml`); los pull requests solo se compilan y verifican (`ci.yml`).

La app se compila con `base: '/'` porque se sirve en la raíz de un dominio propio (`cipherflow.eehub.ing`, configurado en *Settings → Pages → Custom domain*). Si la publicas sin dominio propio, en `https://<usuario>.github.io/<repo>/`, cambia `base` a `'/<repo>/'` en `vite.config.ts` y la ruta que revisa `scripts/check-dist.mjs`; si no coinciden, el navegador pide los archivos en la ruta equivocada y la página queda en blanco.

## Licencia

CipherFlow se distribuye bajo la [licencia Apache 2.0](LICENSE), la misma de CyberChef. Las operaciones son de CyberChef, © Crown Copyright; los avisos de atribución están en [`NOTICE`](NOTICE).
