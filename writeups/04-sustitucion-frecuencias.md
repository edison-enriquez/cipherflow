# Lab 4 — Análisis de frecuencias

**Vulnerabilidad:** un cifrado de sustitución monoalfabética reemplaza cada letra por otra fija. Hay 26! ≈ 4×10²⁶ claves posibles, así que la fuerza bruta es inviable… pero la sustitución **no oculta la estadística del idioma**. En español la E y la A son con diferencia las más frecuentes; esa huella pasa intacta al texto cifrado y delata la clave.

## El reto

Descifra el texto sin la clave, usando solo las frecuencias del español. El bloque *Frequency distribution* te da el conteo; el bloque *Substitute* aplica tu mapa.

## Solución

1. **Mira las frecuencias.** Abre el bloque *Frequency distribution* (panel Salida, «Vista de CyberChef»). Los símbolos más repetidos del cifrado son candidatos a E y A.
2. **Empareja por frecuencia.** Orden aproximado en español: `E A O S N R I L D T C U M P`. Asigna los símbolos más comunes del cifrado a las letras más comunes del idioma.
3. **Usa la estructura.** Las palabras de una letra son A, E, O o Y. Las de dos muy repetidas: DE, LA, EL, EN, SE. Los dígrafos frecuentes (QU, CH, RR) y las terminaciones (-CIÓN, -MENTE, -ADO) confirman letras.
4. **Aplica el mapa con *Substitute*.** En el bloque, `Ciphertext` son las letras cifradas y `Plaintext` tus hipótesis, alineadas carácter a carácter. Ve añadiendo pares:

   Para este reto, la clave (que reconstruyes, no la conoces de antemano) es:

   ```
   Ciphertext:  QWERTYUIOPASDFGHJKLZXCVBNM   (mayúsculas; y sus minúsculas)
   Plaintext:   ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ```

   Es decir, en *Substitute* pones en `Ciphertext` = `QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm` y en `Plaintext` = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`. A medida que aciertas letras, el texto se vuelve legible y las restantes se adivinan por contexto.

El mensaje descifrado es:

> «La criptografia clasica se basa en sustituir cada letra por otra distinta. El problema es que cada idioma tiene una huella de frecuencias muy marcada: en espanol la letra e y la letra a aparecen muchisimo…»

El propio texto describe la técnica que lo rompe.

## Vigenère y el índice de coincidencia

La sustitución **polialfabética** (Vigenère) reparte varias sustituciones según una clave, lo que aplana el histograma y frena el análisis de frecuencias directo. Pero se rompe en dos pasos:

1. **Longitud de la clave** con el **índice de coincidencia** (bloque *Index of Coincidence*): se prueban distintos tamaños; cuando el texto se parte en columnas del tamaño correcto, cada columna es una sustitución simple y su IC se acerca al del idioma (≈ 0,072 en español) en vez del de texto aleatorio (≈ 0,038).
2. **Cada columna** se resuelve como un César con análisis de frecuencias, y el bloque *Vigenère Decode* aplica la clave hallada. (Puedes practicarlo con el ejemplo «Clásicos: ROT13 y Vigenère».)

## Impacto real

Ninguno de estos cifrados ofrece seguridad hoy; su valor es didáctico e histórico (la máquina Enigma es, en el fondo, una sustitución polialfabética muy elaborada, y cayó por análisis estadístico y errores de operación). Enseñan el principio central: **un cifrado que preserva estructura estadística es vulnerable**.

## Mitigación

Los cifrados modernos producen salida indistinguible de aleatoria (difusión y confusión de Shannon): en CipherFlow, cifra un texto con AES y verás en el panel *Proceso* que su entropía se acerca a 8 bits/byte y el análisis de frecuencias se vuelve plano. Esa es la propiedad que le falta a la sustitución.
