# Laboratorios de vulnerabilidades — soluciones

Cada laboratorio se carga desde el menú **Laboratorios** de [CipherFlow](https://edison-enriquez.github.io/cipherflow/). El laboratorio es el reto; aquí está la solución de ejemplo de cada uno.

| # | Laboratorio | Vulnerabilidad | Dificultad |
|---|-------------|----------------|------------|
| 1 | [El pingüino de ECB](01-ecb-pinguino.md) | AES-ECB filtra patrones del texto claro | Básico |
| 2 | [Nonce reutilizado (two-time pad)](02-two-time-pad.md) | Reutilizar el flujo de clave en un cifrado de flujo | Intermedio |
| 3 | [Colisión de MD5](03-md5-colision.md) | MD5 y SHA-1 ya no resisten colisiones | Básico |
| 4 | [Análisis de frecuencias](04-sustitucion-frecuencias.md) | La sustitución monoalfabética conserva la huella del idioma | Intermedio |
| 5 | [Maleabilidad de CBC (bit-flipping)](05-cbc-bitflip.md) | CBC no autentica: se puede alterar el texto claro sin la clave | Avanzado |

> Material educativo. Todas las técnicas se muestran con fines de enseñanza sobre por qué ciertos métodos quedaron obsoletos y cómo se corrigen.
