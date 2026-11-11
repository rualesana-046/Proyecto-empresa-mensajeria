# ADR-002 · Cobro contra entrega sin pérdida ni duplicado

> [NOMBRE 1], [NOMBRE 2], [NOMBRE 3] · [GRUPO 5A/5B]

## 1. Título y estado

**Outbox transaccional + registro de la intención en la base de Cobros + trabajador con reintentos y alquiler + llave de idempotencia ante la pasarela.**
Estado: **Aceptada**. Fecha: [FECHA].

## 2. Contexto

- **D2** (A, A): ningún cobro contra entrega se pierde ni se duplica, aunque se caiga un servicio.
- Restricción externa: la pasarela puede responder 503 (no cobró), tardar más que nuestro timeout (**sí cobró pero no lo sabemos**) o no estar disponible. Acepta una llave de idempotencia.
- Lección de un prototipo previo: el manejador del evento que cobraba directamente **perdía cobros** al agotar los reintentos del broker (el mensaje iba a la cola de muertos y la deuda desaparecía).

Hay cuatro puntos donde se puede perder o duplicar un cobro:

1. Envíos marca `ENTREGADO` pero el evento no llega a publicarse.
2. El evento llega pero Cobros cae antes de cobrar.
3. La pasarela falla y los reintentos se agotan.
4. La pasarela cobra pero la respuesta se pierde, y el reintento cobra otra vez.

## 3. Decisión

| Punto | Mecanismo                                                                                                                                                                                                                                                   | Código                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1     | **Outbox:** el cambio a `ENTREGADO` y el evento `envio.entregado` se guardan en la misma transacción; un relay lo publica después.                                                                                                                          | `shared/outbox.js`, `services/envios/repositorio.js`    |
| 2     | **Registro de la intención:** el manejador de `envio.entregado` solo inserta la fila `PENDIENTE` en `cobros` (`ON CONFLICT (envio_id) DO NOTHING`) y confirma. **Nunca llama a la pasarela.**                                                               | `services/cobros/suscripciones.js`, `repositorio.js`    |
| 3     | **Trabajador con alquiler:** cada 500 ms reclama hasta 10 cobros vencidos con `FOR UPDATE SKIP LOCKED`, suma un intento y mueve `proximo_intento` = timeout + retroceso exponencial (1, 2, 4… hasta 30 s). Sin límite de intentos: la deuda no se descarta. | `services/cobros/trabajador.js`, `dominio.js`           |
| 4     | **Llave de idempotencia = `cobros.id`**, la misma en cada reintento y tras reinicios. La confirmación es condicional (`WHERE estado = 'PENDIENTE'`) y escribe `cobro.confirmado` en el outbox en la misma transacción.                                      | `services/cobros/pasarela-cliente.js`, `repositorio.js` |

Un envío `NO_ENTREGADO` nunca genera cobro porque Cobros **no se suscribe** a `envio.no_entregado`.

## 4. Alternativas descartadas

| Alternativa                                                                       | Razón concreta del descarte                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cobrar dentro del manejador del evento** y confiar en los reintentos del broker | Es el diseño que falló en el prototipo: al agotar `maxAttempts` el mensaje va a `ev:dead` y la deuda se pierde. Con la pasarela fallando el 50 % de los intentos (vista del cliente), 5 entregas dejan ≈ 3 % de cobros perdidos (calculado), y una caída de la pasarela de un minuto pierde todos los de ese minuto. Además ata la duración del manejador a la latencia de un tercero. |
| **Transacción distribuida / 2PC** entre Envíos, Cobros y la pasarela              | La pasarela externa no participa en un protocolo de dos fases; Redis Streams tampoco. Aun entre nuestras bases, un coordinador 2PC bloquea recursos mientras espera y es un punto único de falla. Desproporcionado para un equipo de 3.                                                                                                                                                |
| **Llamada síncrona de Envíos a Cobros** al marcar entregado                       | Si Cobros no responde, Envíos tiene que fallar la entrega o seguir sin cobrar. Acopla la disponibilidad de la entrega a la del cobro y obliga a Envíos a reintentar, que no es su responsabilidad.                                                                                                                                                                                     |

## 5. Consecuencias

**Positivas (medidas):**

- Ráfaga de 20 envíos contra entrega con la pasarela fallando (`FAIL_RATE=0.3`, `LOST_REPLY_RATE=0.2`): **20 cobros reales para 20 envíos en 5 de 5 corridas**, con 31–37 intentos y 5–10 cobros repetidos absorbidos por la llave.
- **Evidencia del valor de la llave:** con `HONOR_IDEMPOTENCY=false` la misma ráfaga produjo **25–36 cobros reales para 20 envíos** en 3 corridas (entre 5 y 16 clientes cobrados dos veces) y la demo falla en todas. En modo determinista (`LOST_FIRST_REPLY=true`, cada llave pierde su primera respuesta) con la llave son siempre exactamente 20 (medido: 20 reales y 20 repetidos ignorados); sin ella son siempre al menos 40 por construcción (medido: 54).
- Cobros detenido durante la entrega: **0 intentos** mientras está caído, **1 cobro** al volver.
- `docker compose kill cobros` (sin apagado ordenado) en plena ráfaga: **20 para 20** (2 sesiones).
- Cada cobro guarda `intentos`, `ultimo_error`, `referencia` y `confirmado_en`: auditoría casi gratis.

**Negativas (reales):**

- **El cobro tarda más:** la ráfaga de 20 tardó entre **10,3 y 26,4 s** en confirmarse entera (5 corridas); un cobro con mala suerte espera 3 s, 4 s, 6 s, 10 s… entre intentos. El trabajador vacía **~1,5 cobros/s** con la pasarela por defecto y **~15 cobros/s** con una pasarela sin fallos (medido: 60 cobros acumulados con Cobros detenido).
- **Sin límite de intentos:** un cobro que la pasarela rechace para siempre (tarjeta inválida, monto no permitido) se reintentará cada ~32 s indefinidamente. No hay estado `RECHAZADO` ni alerta.
- **Todo depende de que la pasarela respete la llave** (R3). Sin eso, el diseño no evita el duplicado del punto 4.
- **Cuatro mecanismos** para un solo requisito: es el código más difícil de explicar del proyecto.
- Al `cobro.confirmado` lo publica el relay: también es al-menos-una-vez y Notificaciones debe descartar el repetido.
