# ADR-001 · Microservicios orientados a eventos y SSE hacia el cliente

> Ana María Ruales, Santiago Nicolás Revelo · Grupo 5B

## 1. Título y estado

**Microservicios pequeños comunicados por eventos en un broker persistente, con SSE hacia el cliente.**
Estado: **Aceptada**. Fecha: 12 de noviembre de 2026.

## 2. Contexto

- **D2** (A, A): ningún cobro contra entrega puede perderse ni duplicarse aunque caiga un servicio. Es la única hoja (A, A) del árbol de utilidad.
- **D1** (A, M): cada cambio de estado debe llegar al cliente en menos de 3 s.
- **D3** (A, M): la asignación debe crecer de 100 a 1.000 envíos/día sin rediseño; lo difícil es la concurrencia, no el volumen (≈ 0,01 envíos/s).
- Restricciones: equipo de 2 personas, un semestre, stack Node.js + Redis + PostgreSQL.

La pregunta es cómo partir el sistema y cómo se comunican las partes para que **la caída de una parte no pierda el cobro** (D2) y **el cliente vea los cambios casi al instante** (D1).

## 3. Decisión

1. Cuatro servicios de negocio, uno por contexto delimitado (`envios`, `asignacion`, `cobros`, `notificaciones`), cada uno con su base de datos.
2. Se comunican **solo por eventos** publicados en Redis Streams (ver ADR-003), escritos primero en un **outbox** dentro de la misma transacción que el cambio (ver ADR-002). No hay HTTP entre servicios de negocio.
3. Cada servicio consume con su **propio grupo de consumo**, así un mismo evento (`envio.entregado`) lo procesan Asignación, Cobros y Notificaciones por separado.
4. Hacia el cliente, `notificaciones` empuja cada evento por **SSE** (`GET /seguimiento/:id/stream`).

## 4. Alternativas descartadas

| Alternativa                                       | Razón concreta del descarte                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monolito en capas**                             | El cobro quedaría dentro de la petición `POST /envios/:id/estado` o de un hilo del mismo proceso: si el proceso cae entre "marcar entregado" y "cobrar", no queda nada que reintente, salvo que construyamos una cola persistente… que es la mitad de esta decisión. Además, la asignación solo escala replicando todo el monolito. |
| **Monolito modular con cola interna persistente** | Es la alternativa más fuerte (resuelve D2 con una tabla-cola y es más barata). Se descarta porque un fallo del proceso detiene entregas, asignaciones y cobros a la vez, y porque no permite escalar solo la asignación (D3). Si D3 no existiera, sería la elegida.                                                                 |
| **Microservicios síncronos (REST)**               | `envios` tendría que llamar a `cobros` al entregar. Si `cobros` no responde, Envíos debe elegir entre fallar la entrega (mal para el mensajero) o seguir sin cobrar (viola D2). Cada llamador tendría que reimplementar reintentos. Tiene el costo de los microservicios sin el desacople temporal.                                 |
| **Polling para el cliente**                       | Para garantizar < 3 s habría que consultar cada ~1 s por cliente: tráfico constante aunque nada cambie.                                                                                                                                                                                                                             |
| **WebSocket para el cliente**                     | Canal bidireccional que no se necesita (el cliente solo recibe); más protocolo y más estado de conexión que SSE.                                                                                                                                                                                                                    |

## 5. Consecuencias

**Positivas (medidas):**

- D1: latencia petición→SSE de **56–107 ms** en 5 corridas (límite 3.000 ms).
- D2: con Cobros detenido, el evento queda en Redis (`lag` = 1) y al volver se cobra **exactamente una vez**.
- D3: con 3 réplicas de `asignacion`, 30 envíos simultáneos sin duplicados ni sobrecupo.
- Con Notificaciones caído, el envío se entrega y se cobra igual.

**Negativas (reales):**

- **Consistencia eventual visible:** justo después de crear un envío, Envíos dice `CREADO` aunque ya haya mensajero; un mensajero que reporte `RECOGIDO` en ese momento recibe **409**. La demo tiene que esperar a `ASIGNADO` antes de mover el envío.
- **Duplicados:** la entrega es al-menos-una-vez; cada consumidor tuvo que diseñarse idempotente. Olvidarlo en un consumidor nuevo es un error fácil de cometer.
- **Más piezas que operar:** 5 procesos, Redis, PostgreSQL con 3 bases y una cola de mensajes muertos que alguien debe vigilar (R5).
- **Depurar es más difícil:** un envío cruza 4 procesos; solo el id del envío en los logs permite seguirlo. No hay trazas distribuidas.
- **SSE no escala horizontalmente tal como está:** con dos réplicas de Notificaciones cada una ve la mitad de los eventos (R2).
- **Sobredimensionado para el volumen actual** (0,01 envíos/s): la justificación es D2 y D3, no el throughput.
