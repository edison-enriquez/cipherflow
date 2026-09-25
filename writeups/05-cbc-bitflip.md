# Lab 5 — Maleabilidad de CBC (bit-flipping)

**Vulnerabilidad:** el cifrado sin autenticar es *maleable*: un atacante puede modificar el texto cifrado para provocar cambios **predecibles** en el texto claro, sin conocer la clave. En CBC el descifrado del primer bloque es `P₀ = D(K, C₀) ⊕ IV`. Como el IV se combina con XOR, voltear un bit del IV voltea el mismo bit del texto claro. Esta maleabilidad es la base de ataques mayores, como el **padding oracle** (POODLE, Lucky13, el fallo de ASP.NET de 2010).

## El reto

El token cifrado descifra a `admin=0;alumno=Edison;grupo=uvas`. Consigue que descifre a `admin=1;…` **sin tocar la clave**.

## Solución

El objetivo es el byte en la posición 6 del texto claro: `'0'` (0x30) debe volverse `'1'` (0x31).

```
Δ = '0' ⊕ '1' = 0x30 ⊕ 0x31 = 0x01
```

Como ese byte está en el primer bloque, se manipula el **IV** en esa misma posición. La rama superior del flujo ya lo calcula:

```
Entrada (IV) ─┐
              ├─► XOR de dos flujos ─► A hex ─► IV modificado
Entrada (máscara: ceros salvo 0x01 en la posición 6) ─┘
```

`IV' = IV ⊕ máscara` cambia solo el byte 6 del IV.

**El paso del reto:** copia el valor de *IV modificado* y pégalo en el parámetro **IV** (formato Hex) del bloque *AES Decrypt* de abajo. El resultado pasa a:

```
admin=1;alumno=Edison;grupo=uvas
```

Solo cambió `admin=0` → `admin=1`. El resto del mensaje queda intacto, porque el IV únicamente afecta al primer bloque.

> El bloque de descifrado tiene la clave solo para que **veas** el efecto. El atacante real no la conoce ni la necesita: manipula el mensaje a ciegas, confiando en que sabe dónde está el byte objetivo.

## Por qué

En CBC:

```
P₀ = D(K, C₀) ⊕ IV
P'₀ = D(K, C₀) ⊕ IV'  = D(K, C₀) ⊕ (IV ⊕ Δ) = P₀ ⊕ Δ
```

`D(K, C₀)` no cambia porque ni la clave ni `C₀` se tocan. El XOR con `Δ` se traslada directamente al texto claro. Si el byte objetivo estuviera en el bloque `n`, se voltearía el mismo byte de `Cₙ₋₁` en su lugar (a costa de convertir el bloque `n-1` en basura, un compromiso habitual del ataque).

## Del bit-flipping al padding oracle

Este lab muestra el *primitivo*. El **padding oracle** lo convierte en un descifrado completo: si el servidor revela (por un mensaje de error o por el tiempo de respuesta) si el relleno PKCS#7 de un mensaje es válido, el atacante ajusta byte a byte el bloque anterior hasta forzar un relleno válido y, de ahí, deduce `D(K, Cᵢ)` y por tanto el texto claro —sin la clave—. Es adaptativo (cientos de consultas por bloque), por eso no se resuelve en un grafo estático como este; pero descansa exactamente en la maleabilidad que acabas de explotar.

## Impacto real

- **POODLE (2014):** padding oracle sobre SSL 3.0 con CBC.
- **Lucky Thirteen (2013):** oracle por tiempo en TLS.
- **ASP.NET (2010):** padding oracle que permitía leer archivos y forjar cookies.
- **Cookies de sesión** cifradas con CBC sin MAC: bit-flipping para escalar privilegios, justo como este `admin=0` → `admin=1`.

## Mitigación

Usa **cifrado autenticado (AEAD)**: AES-GCM o ChaCha20-Poly1305. Añaden una etiqueta que se verifica antes de descifrar, así que cualquier bit alterado se detecta y el mensaje se rechaza. Pruébalo en CipherFlow con el ejemplo «AES-GCM»: cambia un byte del texto cifrado y el descifrado falla con *authentication failed*, en vez de entregar un texto claro manipulado. Si no puedes usar AEAD, aplica **encrypt-then-MAC** con un MAC de tiempo constante.
