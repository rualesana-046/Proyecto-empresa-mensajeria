# 04 · Contextos delimitados

> Ana María Ruales, Santiago Nicolás Revelo · Grupo 5B

Cada contexto es **un servicio, un proceso y (si guarda datos) una base propia**. Ningún servicio lee la base de otro: lo que necesita de otro contexto lo aprende **por eventos**.

## Mapa de contextos

| Contexto (servicio)                             | Responsabilidad                                                       | Señal concreta que justifica la frontera                                                                                                                                               | Datos que **posee**                                                                                              | Datos de otros que conoce **solo por eventos**                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Envíos** (`envios`)                           | Ciclo de vida del envío y su máquina de estados                       | **Ritmo de cambio distinto:** las transiciones válidas (`CREADO→ASIGNADO→RECOGIDO→EN_RUTA→ENTREGADO/NO_ENTREGADO`) cambian por razones operativas, no por reglas de dinero ni de rutas | `envios_db`: tabla `envios` (remitente, destinatario, dirección, zona, contra entrega, valor, estado, mensajero) | `mensajeroId` (por `envio.asignado`)                                                                      |
| **Asignación** (`asignacion`)                   | Elegir mensajero por zona y capacidad, y devolver el cupo al terminar | **Escala distinta (D3):** es lo único que necesita réplicas y control de concurrencia; sus reglas (zonas, prioridades) crecerán solas                                                  | `asignacion_db`: `mensajeros` (zona, capacidad, carga) y `asignaciones`                                          | Zona y datos del envío (por `envio.creado`); fin del envío (por `envio.entregado` / `envio.no_entregado`) |
| **Cobros** (`cobros`)                           | Cobrar contra entrega solo si llegó, una sola vez                     | **Garantías de consistencia distintas (D2):** exige idempotencia, reintentos y auditoría que los demás no necesitan; además integra un sistema externo                                 | `cobros_db`: tabla `cobros` (monto, estado, intentos, próximo intento, último error, referencia)                 | Que el envío se entregó, su valor y si es contra entrega (por `envio.entregado`)                          |
| **Notificaciones** (`notificaciones`)           | Empujar cada cambio al cliente por SSE                                | **Es una vista de lectura:** no decide nada; si cae, el negocio sigue (medido en E6). Separarla protege D2 de los problemas de D1                                                      | Nada persistente: historial en memoria por envío                                                                 | Todo: los 6 eventos de envío y `cobro.confirmado`                                                         |
| _(externo)_ **Pasarela** (`pasarela`, simulada) | Mover el dinero                                                       | No es parte del sistema; existe para poder probar D2 con fallos configurables                                                                                                          | Su libro `llave → cobro`                                                                                         | — (Cobros la llama por HTTP)                                                                              |

## Lenguaje de cada contexto

La misma palabra significa cosas distintas según el contexto, otra señal de frontera:

- **"Estado"** en Envíos es la posición en la máquina de estados; en Cobros es `PENDIENTE` / `CONFIRMADO`, que no tiene nada que ver.
- **"Asignado"** para Envíos es un estado al que llega por un evento; para Asignación es una fila en `asignaciones` que consume cupo.
- **"Valor del cobro"** en Envíos es un dato del pedido; en Cobros es una **deuda** con intentos, llave y referencia de la pasarela.

## Una base por servicio: decisión consciente

- **Por qué:** si Cobros pudiera leer `envios`, cualquier cambio en esa tabla rompería Cobros sin que nadie lo note, y la tentación de "consultar el estado del envío antes de cobrar" reintroduciría el acoplamiento síncrono que el estilo evita.
- **Cómo se implementa aquí:** un solo contenedor `postgres` con **tres bases** (`envios_db`, `asignacion_db`, `cobros_db`, creadas en `db/init.sql`). Cada servicio se conecta solo a la suya (`DB_NOMBRE` en su `config.js`).
- **Lo que cuesta:** datos repetidos (la zona del envío vive en Envíos y viaja a Asignación en el evento); no hay _joins_ entre contextos; un reporte "envíos con su cobro" tendría que armarse desde eventos.
- **Lo que no es:** aislamiento físico. Las tres bases comparten servidor y usuario de desarrollo; en producción cada servicio tendría su propio usuario con permisos solo sobre su base (riesgo R1 cubre la instancia única).

## Qué hay en `shared/` (y qué no)

`shared/` contiene **solo** el contrato de mensajería (`eventos.js`: nombres de evento, estados que viajan en `data.estado`, nombre de los streams) e infraestructura (`bus.js`, `suscripcion.js`, `db.js`, `outbox.js`, `http.js`, `log.js`, `apagado.js`, `tiempo.js`, `config.js`). La máquina de estados, la elección de mensajero y el cálculo del retroceso viven en el `dominio.js` de su servicio.
