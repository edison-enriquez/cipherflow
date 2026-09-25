# Lab 2 — Nonce reutilizado (two-time pad)

**Vulnerabilidad:** un cifrado de flujo (RC4, AES-CTR, ChaCha20, o el one-time pad) produce un flujo de clave `k` que se combina con el mensaje mediante XOR: `c = m ⊕ k`. La seguridad depende de que **`k` nunca se repita**. Si dos mensajes se cifran con el mismo `k` (mismo nonce/IV, o la misma semilla), la clave se puede cancelar.

## El reto

Tienes `c1` y `c2`, cifrados con el mismo keystream. Recupera `m1` y `m2` sin la clave. Sabes que `m1` empieza por «Nos vemos a».

## Solución

El bloque *XOR de dos flujos* ya calcula:

```
c1 ⊕ c2 = (m1 ⊕ k) ⊕ (m2 ⊕ k) = m1 ⊕ m2
```

El keystream desaparece porque `k ⊕ k = 0`. Queda `m1 ⊕ m2`, que **no** es legible, pero contiene toda la información: si conoces un trozo de uno de los mensajes, obtienes el mismo trozo del otro.

### Crib dragging paso a paso

1. Añade un bloque **XOR** después del *XOR de dos flujos*. En su clave (formato **UTF-8**) escribe la cuña conocida: `Nos vemos a`.
   XOR es un cifrado de flujo con clave repetida, así que esto calcula `(m1 ⊕ m2) ⊕ "Nos vemos a"` en los primeros 11 bytes. Como en esa posición `m1 = "Nos vemos a"`, el resultado es **el arranque de `m2`**: `La clave de…`.
2. Ahora usa ese trozo de `m2` como nueva cuña, pero aplicado del otro lado: `(m1 ⊕ m2) ⊕ "La clave de"` revela más de `m1`.
3. Alterna: cada trozo revelado de un mensaje destapa el mismo trozo del otro. El español ayuda —las palabras se completan solas («muelle», «golondrina»)—.

Repitiendo la cuña se recupera todo:

- `m1 = "Nos vemos a las diez en el muelle numero siete, trae el maletin."`
- `m2 = "La clave del cofre es golondrina azul; no se lo digas a nadie hoy."`

### Atajo con texto claro conocido

Si conocieras `m1` completo, el flujo de clave se recupera directamente:

```
k = c1 ⊕ m1        (bloque XOR de dos flujos)
m2 = c2 ⊕ k        (otro XOR de dos flujos)
```

y descifras cualquier otro mensaje cifrado con ese mismo `k`.

## Por qué

XOR es su propia inversa y es asociativo/conmutativo. Toda la seguridad del one-time pad vive en que `k` sea aleatorio y de un solo uso. Reutilizarlo una vez lo degrada a un cifrado de sustitución sobre `m1 ⊕ m2`, que se rompe con estadística y cuñas.

## Impacto real

Es un patrón recurrente: el **WEP** de Wi-Fi reutilizaba IVs de 24 bits de RC4; **Microsoft Office** y **PPTP** tuvieron fallos de nonce; y muchos usos incorrectos de **AES-CTR** o **GCM** repiten el nonce. Repetir el nonce en GCM es aún peor: además de exponer los textos, permite recuperar la clave de autenticación.

## Mitigación

Nonce único por mensaje, siempre. Genera el nonce de forma aleatoria (96 bits en GCM) o con un contador que nunca se reinicie con la misma clave. Rota la clave antes de agotar el espacio de nonces.
