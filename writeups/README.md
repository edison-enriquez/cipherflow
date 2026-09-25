# Laboratorios de vulnerabilidades — soluciones

Cada laboratorio se carga desde el menú **Laboratorios** de [CipherFlow](https://cipherflow.eehub.ing/). El laboratorio es el reto; aquí está la solución de ejemplo de cada uno.

| # | Laboratorio | Vulnerabilidad | Dificultad |
|---|-------------|----------------|------------|
| 1 | [El pingüino de ECB](01-ecb-pinguino.md) | AES-ECB filtra patrones del texto claro | Básico |
| 2 | [Nonce reutilizado (two-time pad)](02-two-time-pad.md) | Reutilizar el flujo de clave en un cifrado de flujo | Intermedio |
| 3 | [Colisión de MD5](03-md5-colision.md) | MD5 y SHA-1 ya no resisten colisiones | Básico |
| 4 | [Análisis de frecuencias](04-sustitucion-frecuencias.md) | La sustitución monoalfabética conserva la huella del idioma | Intermedio |
| 5 | [Maleabilidad de CBC (bit-flipping)](05-cbc-bitflip.md) | CBC no autentica: se puede alterar el texto claro sin la clave | Avanzado |

Las capturas de `img/` son del build real de CipherFlow (tema oscuro) resolviendo cada laboratorio, y los valores que muestran (hashes, bytes, entropías, textos recuperados) están comprobados contra los datos de `src/labs.data.ts`. Los diagramas `.svg` se generan con esos mismos datos: `node scripts/writeups-svg.mjs`.

## Verificar fuera de CipherFlow

Cada writeup tiene una sección **«Verifícalo con otras herramientas»** con comandos que reproducen el resultado de la plataforma, para que compruebes que CipherFlow no hace trampa y practiques con las herramientas de uso diario. Las salidas que aparecen en los writeups son las reales de esos comandos.

| Herramienta | Para qué | Dónde conseguirla |
|---|---|---|
| `openssl` (1.1 o 3.x) | cifrar/descifrar AES, hashes (`openssl dgst`) | Linux/macOS: ya viene o por el gestor de paquetes. Windows: incluida en **Git Bash** |
| `xxd` | pasar de hex a binario (`xxd -r -p`) y volcar bytes | paquete `vim`/`xxd`; incluido en Git Bash |
| coreutils: `head`, `tail`, `cat`, `sort`, `uniq`, `tr`, `fold`, `cmp`, `md5sum`, `sha256sum` | cortar, comparar y contar | Linux/Git Bash. En macOS: `brew install coreutils` (o `md5`/`shasum -a 256`) |
| `python3` | XOR entre archivos, entropía, extraer datos del lab | [python.org](https://www.python.org/). En Windows el comando suele ser `python` |
| `node` | la demo de AES-GCM (`openssl enc` no admite modos AEAD) | la misma instalación que usa CipherFlow |

Los comandos están escritos para bash (Linux, macOS o Git Bash en Windows). Los que extraen datos de `src/labs.data.ts` se ejecutan desde la raíz del repositorio.

> Material educativo. Todas las técnicas se muestran con fines de enseñanza sobre por qué ciertos métodos quedaron obsoletos y cómo se corrigen.
