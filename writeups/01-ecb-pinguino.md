# Lab 1 — El pingüino de ECB

**Vulnerabilidad:** ECB (Electronic Codebook) cifra cada bloque de 16 bytes de forma independiente y determinista. Dos bloques de texto claro iguales producen dos bloques cifrados iguales, así que la estructura del mensaje sobrevive al cifrado. El nombre viene del clásico experimento de cifrar la imagen del pingüino de Linux (Tux): tras ECB, la silueta sigue siendo visible.

## El reto

La imagen de un candado se cifró con AES-ECB y la figura se sigue viendo. Cambia el modo a CBC y explica por qué desaparece.

## Solución

El flujo ya viene montado:

```
Entrada (candado.bmp)
├── Take bytes (0, 54)  → cabecera BMP
└── Drop bytes (54)     → píxeles ──► AES Encrypt (ECB/NoPadding) ──┐
                                                                    ▼
                                              Unir flujos (cabecera + píxeles cifrados)
                                                                    ▼
                                                             Render Image
```

Se separan los 54 bytes de cabecera del BMP (que deben quedar intactos para que siga siendo una imagen válida) de los datos de píxel. Solo se cifran los píxeles; luego se vuelve a pegar la cabecera y se renderiza.

**Con ECB** se reconoce el candado: la imagen tiene grandes zonas de un solo color, es decir, muchísimos bloques de 16 bytes idénticos. ECB los convierte a todos en el mismo bloque cifrado, de modo que las regiones uniformes siguen siendo uniformes y el contorno se dibuja solo.

**El paso del reto:** abre el bloque *AES Encrypt* y cambia **Mode** de `ECB/NoPadding` a `CBC/NoPadding`. Vuelve a abrir *Render Image*: ahora es ruido uniforme, sin figura.

## Por qué

- ECB: `Cᵢ = E(K, Pᵢ)`. No hay estado entre bloques. `Pᵢ = Pⱼ ⇒ Cᵢ = Cⱼ`.
- CBC: `Cᵢ = E(K, Pᵢ ⊕ Cᵢ₋₁)`. Cada bloque se mezcla (XOR) con el cifrado anterior antes de cifrarse, así que dos bloques de entrada iguales producen cifrados distintos y el patrón se rompe.

En CipherFlow puedes comprobarlo en el panel **Proceso** del bloque AES: en ECB la entropía de salida sube, pero el conteo de bloques repetidos sigue siendo alto; en CBC los bloques repetidos desaparecen.

## Impacto real

ECB no solo afecta imágenes: filtra cualquier estructura repetida (campos fijos de un formato, cabeceras, valores por defecto). Por eso está desaconsejado para prácticamente todo. Un atacante que observa tráfico cifrado con ECB puede deducir cuándo se repite un mensaje o localizar campos conocidos.

## Mitigación

Nunca uses ECB para datos con estructura. Usa un modo autenticado (**AES-GCM**, ChaCha20-Poly1305) que además de ocultar patrones detecta manipulaciones. Si el escenario obliga a CBC, combínalo con un MAC (encrypt-then-MAC) y un IV aleatorio por mensaje.
