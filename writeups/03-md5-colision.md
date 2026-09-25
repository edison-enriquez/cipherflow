# Lab 3 — Colisión de MD5

**Vulnerabilidad:** una función hash criptográfica debe ser *resistente a colisiones*: debe ser inviable encontrar dos entradas distintas con el mismo hash. MD5 se rompió en 2004 (Wang et al.) y hoy se generan colisiones en segundos. SHA-1 cayó en 2017 (ataque *SHAttered* de Google). Un hash sin resistencia a colisiones no sirve para integridad ni para firmas.

## El reto

Los bloques A y B son dos archivos distintos (difieren en 6 bytes). Demuestra que MD5 no distingue archivos y explica qué ataque habilita.

## Solución

El flujo calcula `MD5(A)` y `MD5(B)`:

```
A (128 bytes) ─► MD5 ─► 79054025255fb1a26e4bc422aef54eb4
B (128 bytes) ─► MD5 ─► 79054025255fb1a26e4bc422aef54eb4
```

**Idénticos**, aunque A ≠ B. Este es el par clásico de Wang et al.: dos bloques que difieren en las posiciones 19, 45, 59, 83, 109 y 123.

**El paso del reto:** agrega a cada rama un bloque **SHA2** (Size 256) y compara:

```
A ─► SHA2-256 ─► 8d12236e5c4ed9f4e790db4d…
B ─► SHA2-256 ─► b9fef2a8fc93b05e7701e971…
```

SHA-256 sí los distingue: dos hashes completamente diferentes. La conclusión es directa: si un sistema identifica archivos por su MD5, dos archivos distintos le parecen el mismo.

En el panel **Proceso** del bloque MD5 puedes ver además la construcción interna del hash; MD5 procesa el mensaje en bloques de 64 bytes, y el ataque explota precisamente cómo se propagan las diferencias entre dos bloques consecutivos.

## Por qué importan las 6 diferencias

La colisión no es casual: los seis bytes que cambian están calculados para que las diferencias se cancelen dentro de la función de compresión de MD5 (rutas diferenciales). El resto del mensaje puede ser cualquier cosa, e incluso se puede anteponer un prefijo común arbitrario (*chosen-prefix collision*, Stevens 2007), que es lo que permitió falsificar un certificado CA real.

## Impacto real

- **Certificados X.509 falsos:** en 2008 se creó un certificado de CA fraudulento con el mismo MD5 que uno legítimo.
- **Flame (2012):** malware que falsificó una firma de Microsoft usando una colisión de MD5 para aparentar ser una actualización de Windows.
- **Integridad rota:** un `md5sum` que coincide ya no garantiza que un archivo no fue sustituido.

## Mitigación

No uses MD5 ni SHA-1 para nada que dependa de resistencia a colisiones (firmas, certificados, verificación de descargas, deduplicación con implicaciones de seguridad). Usa **SHA-256** o superior. Para autenticar mensajes con clave, usa **HMAC** (ver por qué en el Lab 5 y en el ejemplo «SHA-256 y HMAC»). MD5 solo sobrevive como suma de verificación no adversarial (detectar corrupción accidental).
