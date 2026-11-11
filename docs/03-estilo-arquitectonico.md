# 03 · Estilo arquitectónico

> [NOMBRE 1], [NOMBRE 2], [NOMBRE 3] · [GRUPO 5A/5B]

## Estilo elegido

**Microservicios pequeños orientados a eventos**, comunicados por un **broker con persistencia (Redis Streams)**, con **una base de datos PostgreSQL por servicio**, y **SSE (Server-Sent Events)** para empujar el estado al cliente.

- Entre servicios de negocio **no hay llamadas HTTP**: solo eventos. La única llamada HTTP saliente es de `cobros` a la pasarela externa.
- Cada servicio escribe su cambio y su evento en la **misma transacción** (outbox) y un _relay_ lo publica.
- Cada evento lo consumen **varios grupos de consumo independientes** (por ejemplo, `envio.entregado` lo leen `asignacion`, `cobros` y `notificaciones`, cada uno a su ritmo).

## Qué driver lo justifica

| Driver                        | Cómo lo sirve el estilo                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D2** (cobro exacto)         | Es el que más pesa. Con eventos persistidos, si Cobros cae el evento `envio.entregado` **espera en Redis** y se procesa al volver (medido en `chaos.mjs`). Con llamadas síncronas, Envíos tendría que decidir qué hacer si Cobros no responde, y la entrega quedaría acoplada al cobro. La base propia de Cobros permite guardar la "deuda" antes de llamar a la pasarela. |
| **D1** (< 3 s)                | El cambio se publica en cuanto se confirma la transacción y Notificaciones lo empuja por SSE. Medido: 56–107 ms en 5 corridas. Inferimos (no lo medimos por separado) que la mayor parte es la espera del relay, que revisa el outbox cada 100 ms.                                                                                                                         |
| **D3** (crecer sin rediseñar) | La asignación es un consumidor más: se replica con `--scale` y las réplicas comparten el grupo de consumo (cada evento lo procesa una sola). Cambiar sus reglas no toca a los demás.                                                                                                                                                                                       |

## Qué sacrifica (y por qué se acepta)

| Se sacrifica                | Cómo se nota en este sistema                                                                                                                                                                              | Por qué es aceptable                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Consistencia inmediata**  | Justo después de crear un envío, `GET /envios/:id` dice `CREADO` aunque Asignación ya eligió mensajero; unos ms después dice `ASIGNADO`. Si el mensajero reporta `RECOGIDO` en ese intervalo, recibe 409. | El negocio tolera segundos de retraso en la asignación; lo que no tolera es perder dinero (D2).                           |
| **Simplicidad**             | 5 procesos, 3 bases, 1 broker, outbox, relay, consumidores idempotentes. Un monolito haría lo mismo con menos piezas.                                                                                     | Cada pieza responde a un escenario concreto (ver 05-tacticas). Aun así es la crítica más fuerte (ver 08-guia-de-defensa). |
| **Facilidad de depuración** | Un envío atraviesa 4 procesos; seguirlo exige mirar varios logs. Por eso los logs llevan `[servicio] (envio <id>)`.                                                                                       | Mitigado con el id del envío en cada línea y `GET /seguimiento/:id`. No hay trazas distribuidas.                          |
| **Carga operativa**         | Hay que vigilar Redis, Postgres, la cola de mensajes muertos (`ev:dead`) y 5 servicios.                                                                                                                   | En el esqueleto lo resuelve Docker Compose; en producción sería un costo real (riesgos R1 y R5).                          |
| **Exactamente-una-vez**     | El relay y el broker son _al-menos-una-vez_: los eventos **pueden llegar repetidos**.                                                                                                                     | Cada consumidor es idempotente (claves únicas, condiciones `WHERE estado = …`, registro de `eventId`).                    |

## Alternativas evaluadas

Escala: ✔ cumple bien · ~ cumple con esfuerzo extra · ✘ no cumple o pone en riesgo.

| Alternativa                                 | D1 (< 3 s)                       | D2 (cobro exacto)                                                                                                                                                            | D3 (crecer, concurrencia)                                               | Costo (equipo de 3, un semestre)                |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| **A) Monolito en capas**                    | ✔ con SSE desde el mismo proceso | ~ una transacción local ayuda, pero **la llamada a la pasarela queda dentro de la petición**: si el proceso cae a mitad, no hay quién reintente sin construir igual una cola | ~ se escala el monolito entero; la asignación compite con todo lo demás | ✔ el más barato                                 |
| **B) Monolito modular con cola interna**    | ✔                                | ~ mejora A si la cola es persistente (tabla), pero un fallo del proceso detiene **todo**: entregas y cobros juntos                                                           | ~ los módulos no se escalan por separado                                | ✔ barato; **la alternativa más seria** (ver 08) |
| **C) Microservicios síncronos (REST)**      | ✔                                | ✘ Envíos llama a Cobros al entregar: si Cobros cae, o la entrega falla o el cobro se pierde; hay que inventar reintentos en cada llamador                                    | ~ cadenas de llamadas: la latencia y los fallos se suman                | ✘ costo de microservicios sin su beneficio      |
| **D) Microservicios por eventos** (elegida) | ✔ medido ~100 ms                 | ✔ el evento persiste en el broker y la deuda en la base de Cobros; medido 20/20 y 1/1 con caída                                                                              | ✔ réplicas en el mismo grupo de consumo; medido con 3 réplicas          | ~ el más caro de operar de los cuatro           |

**Lectura de la tabla:** D no gana en costo. Gana en D2, que es la única hoja (A, A) del árbol de utilidad. Si D2 no existiera, B sería la recomendación.

## Canal hacia el cliente: SSE

| Opción                 | Por qué                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SSE** (elegida)      | El cliente **solo recibe**. SSE es HTTP normal, se reconecta solo (`EventSource`) y basta un `res.write` en el servidor.                                               |
| WebSocket (descartada) | Bidireccional: no se necesita, y añade protocolo, _handshake_ y manejo de estado de conexión.                                                                          |
| Polling (descartado)   | Para garantizar < 3 s habría que consultar cada ~1 s por cada cliente abierto: tráfico constante aunque nada cambie, y la latencia promedio es la mitad del intervalo. |
