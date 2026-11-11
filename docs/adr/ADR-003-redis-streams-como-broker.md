# ADR-003 · Redis Streams como broker de mensajes

> Ana María Ruales, Santiago Nicolás Revelo · Grupo 5B

## 1. Título y estado

**Redis Streams con grupos de consumo, confirmación explícita (`XACK`), recuperación de pendientes (`XAUTOCLAIM`), cola de mensajes muertos (`ev:dead`) y persistencia AOF (`appendfsync everysec`).**
Estado: **Aceptada**. Fecha: 12 de noviembre de 2026.

## 2. Contexto

ADR-001 exige un broker persistente con:

- **Varios consumidores independientes por evento** (D1, D2): `envio.entregado` lo leen Asignación, Cobros y Notificaciones.
- **Consumidores competidores** dentro de un mismo servicio (D3): réplicas de `asignacion` que se reparten los eventos.
- **Confirmación explícita y reentrega** si un consumidor muere sin confirmar (D2).
- Restricción: equipo de 2 personas, un semestre, todo debe arrancar con un `docker compose up`.

## 3. Decisión

- Un stream por tipo de evento: `ev:<tipo>` (por ejemplo `ev:envio.entregado`).
- Un **grupo de consumo por servicio** (nombre = nombre del servicio); el consumidor se llama `<servicio>-<hostname>-<pid>` para que las réplicas no choquen.
- Lectura con `XREADGROUP … BLOCK` en una conexión dedicada; `XACK` **solo si el manejador no lanzó error**.
- Cada segundo, `XAUTOCLAIM` recupera mensajes sin confirmar por más de 3 s; si superan 5 entregas, se copian a `ev:dead` y se confirman.
- Redis con `--appendonly yes --appendfsync everysec` y volumen persistente.
- Todo encapsulado en `shared/bus.js` (`publish`, `subscribe`) y `shared/suscripcion.js` (grupo, lectura, recuperación y mensajes muertos).

## 4. Alternativas descartadas

| Alternativa                                                           | Razón concreta del descarte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RabbitMQ**                                                          | Es la alternativa más madura y trae **de serie** lo que aquí se programó a mano: colas durables, _ack_, reentrega y _dead-letter exchange_ (`shared/suscripcion.js` tiene ~150 líneas que lo reimplementan). Se descarta por dos razones concretas: (1) en RabbitMQ un mensaje consumido sale de la cola, y un consumidor que se agrega después no ve los eventos anteriores salvo que su cola exista de antemano; con Streams el historial queda en el stream y un grupo nuevo puede leer desde el inicio (`XGROUP CREATE … 0`), que es lo que permite arrancar los servicios en cualquier orden; (2) `XINFO GROUPS` muestra en un comando el fan-out y el rezago de cada grupo, la evidencia que usa la demo. El costo de aprendizaje (exchanges, bindings, una cola por consumidor) pesó, pero solo como desempate: si el equipo ya conociera RabbitMQ sería una elección igual de defendible. |
| **Kafka**                                                             | Pensado para cientos de miles de mensajes por segundo; aquí hay ≈ 0,01 envíos/s. Exige más infraestructura (KRaft o ZooKeeper, particiones, retención) y su modelo de _offsets_ no trae cola de muertos ni reentrega por mensaje: habría que construirlas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Tabla en PostgreSQL como cola** (`SELECT … FOR UPDATE SKIP LOCKED`) | Simple y transaccional (de hecho el outbox y el trabajador de cobro ya la usan). Se descarta como broker **entre** servicios porque obligaría a que todos lean una tabla común —rompiendo "una base por servicio"— o a duplicar una tabla por consumidor, y porque el _fan-out_ a varios grupos habría que programarlo a mano.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 5. Consecuencias

**Positivas:**

- Grupos de consumo, `XACK`, `XAUTOCLAIM` y `XINFO GROUPS` cubren todo lo que pide ADR-001 en ~180 líneas (`shared/bus.js` y `shared/suscripcion.js`), a cambio de mantener ese código nosotros.
- El fan-out es visible y demostrable: `npm run demo` imprime los grupos de `ev:envio.entregado` (asignacion, cobros, notificaciones) con sus pendientes.
- Un solo contenedor ligero; arranca en segundos.

**Negativas (reales):**

- **Instancia única:** si el contenedor `redis` cae, nadie publica ni consume hasta que vuelva (los outbox acumulan, así que no se pierde lo escrito en Postgres). No hay réplica ni Sentinel (R1).
- **Durabilidad `everysec`:** ante una caída del servidor se puede perder hasta ~1 s de escrituras en Redis. Lo publicado por el relay ya está marcado `published` en el outbox, así que **esos eventos no se republican** (R1).
- **Sin esquemas de eventos:** `data` es JSON libre. Si Envíos cambia un campo, los consumidores se rompen en tiempo de ejecución; el contrato solo está en `shared/eventos.js` y en la documentación.
- **Los streams crecen sin límite:** no se usa `MAXLEN` ni recorte; en producción habría que definir retención.
- **`ev:dead` no tiene consumidor:** los mensajes muertos se acumulan y nadie los mira (R5).
- **Sin orden estricto entre streams:** `envio.asignado` y `envio.recogido` viven en streams distintos; un consumidor puede verlos en otro orden.
