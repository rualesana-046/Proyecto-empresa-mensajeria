# Logística de mensajería · Esqueleto funcional por eventos

> Proyecto de Arquitectura de Software · Ana María Ruales, Santiago Nicolás Revelo · Grupo 5B

Esqueleto (_walking skeleton_) de una empresa de mensajería: recibe envíos, los asigna a mensajeros por zona y capacidad, sigue su estado y cobra contra entrega. Demuestra la decisión arquitectónica: **microservicios orientados a eventos sobre Redis Streams, una base PostgreSQL por servicio y SSE hacia el cliente**.

El diseño documentado (Entregable 1) está en [`docs/`](docs/):

| Documento                                                    | Contenido                                              |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| [01-drivers](docs/01-drivers.md)                             | Drivers, árbol de utilidad y restricciones             |
| [02-escenarios](docs/02-escenarios.md)                       | Escenarios de seis partes con medidas reales           |
| [03-estilo-arquitectonico](docs/03-estilo-arquitectonico.md) | Estilo elegido, qué sacrifica y tabla de alternativas  |
| [04-contextos-delimitados](docs/04-contextos-delimitados.md) | Fronteras y la señal que justifica cada una            |
| [05-tacticas](docs/05-tacticas.md)                           | Tácticas, qué degradan, y la lección del cobro perdido |
| [06-c4](docs/06-c4.md)                                       | Diagramas C4 niveles 1 y 2 con leyenda                 |
| [adr/](docs/adr/)                                            | ADR-001 estilo · ADR-002 cobro · ADR-003 broker        |
| [07-riesgos](docs/07-riesgos.md)                             | Riesgos y qué verificar para descartarlos              |
| [08-guia-de-defensa](docs/08-guia-de-defensa.md)             | Borrador para preparar la sustentación                 |
| [09-convenciones](docs/09-convenciones.md)                   | Convenciones de código                                 |

## Requisitos

- **Docker** con Docker Compose v2 (probado con Docker 29.8 y Compose 5.6).
- **Node.js ≥ 22** en el host, solo para correr `npm run demo`, `chaos`, `escala`, `lint` y `test`.

## Levantar todo con un comando

```bash
docker compose up --build
```

Levanta 7 contenedores (`redis`, `postgres`, `pasarela`, `envios`, `asignacion`, `cobros`, `notificaciones`). Cada uno tiene _healthcheck_; medido: todos `healthy` en **22 s** sin imágenes descargadas (build sin caché) y en ~10 s con las imágenes ya en caché. Para la sustentación, descargar las imágenes antes. Para verlo:

```bash
docker compose ps
```

Para empezar de cero (borra los volúmenes de Redis y Postgres):

```bash
docker compose down -v
```

## Demostraciones

Primero, en otra terminal, instalar las dependencias de los scripts:

```bash
npm install
```

### `npm run demo` — recorrido completo con verificaciones

```bash
npm run demo
```

1. **D1:** crea un envío contra entrega, abre el SSE **como un cliente real**, lo mueve por `RECOGIDO → EN_RUTA → ENTREGADO` y mide cada cambio (debe ser < 3.000 ms). Verifica 409 (transición inválida), 400 (faltan campos) y 422 (contra entrega sin valor).
2. Crea un envío contra entrega que termina `NO_ENTREGADO` (al final verifica que **no** tiene cobro).
3. **D2:** ráfaga de 20 envíos (configurable con `BURST=50 npm run demo`) hasta `ENTREGADO` con la pasarela fallando a propósito; espera a que todos los cobros queden `CONFIRMADO` y verifica en `GET /stats` de la pasarela que **cobros reales = envíos** y **intentos > cobros** (hubo reintentos).
4. Imprime con `XINFO GROUPS` los grupos de consumo de `ev:envio.entregado` y `ev:envio.asignado`: un mismo evento consumido por servicios distintos por separado.

Sale con código ≠ 0 si cualquier verificación falla.

### `npm run chaos` — Cobros se cae en plena entrega

```bash
npm run chaos
```

Lleva un envío a `EN_RUTA`, ejecuta `docker compose stop cobros`, lo marca `ENTREGADO`, espera 5 s y verifica que **no hubo intentos de cobro** y que el evento espera en Redis (`lag` del grupo `cobros`); luego `docker compose start cobros` y verifica **exactamente un** cobro real.

### Escalar `asignacion` — `npm run escala`

```bash
docker compose up --build -d --scale asignacion=3
```

```bash
npm run escala
```

Crea 30 envíos **a la vez y en la misma zona** (las 3 réplicas compiten por los mismos 2 mensajeros). Qué mirar en la salida:

- **reparto por réplica** (líneas de log de `asignacion-1`, `-2`, `-3`): las tres trabajan;
- **ningún envío generó dos `envio.asignado`**;
- **`carga` = asignaciones activas y `carga <= capacidad`** para cada mensajero, con los envíos activos y después de entregarlos.

`asignacion` no publica su puerto en el host justamente para que `--scale` no choque. Volver a una réplica:

```bash
docker compose up -d --scale asignacion=1
```

### Mostrar el doble cobro que evita la llave de idempotencia

```bash
HONOR_IDEMPOTENCY=false docker compose up -d pasarela
```

```bash
npm run demo
```

La pasarela ignora la llave `Idempotency-Key`. Cuando cobra pero responde tarde (después del timeout de 2 s de Cobros), el reintento **cobra otra vez**. El paso 3 de la demo **falla** con más cobros reales que envíos (medido en 3 corridas: entre 25 y 36 cobros para 20 envíos) y el script sale con código 1. Restaurar:

```bash
docker compose up -d pasarela
```

Ese resultado es aleatorio. Para la sustentación conviene el **modo determinista**, en el que la primera llamada de cada llave siempre cobra y responde tarde:

```bash
LOST_FIRST_REPLY=true HONOR_IDEMPOTENCY=false docker compose up -d pasarela
```

Así la demo falla siempre (medido: 54 cobros para 20 envíos; por construcción nunca menos de 40). Con `LOST_FIRST_REPLY=true` y la llave respetada da siempre 20 cobros reales y 20 repetidos ignorados.

Perillas de la pasarela: `FAIL_RATE` (por defecto 0.3: responde 503 sin cobrar), `LOST_REPLY_RATE` (por defecto 0.2: cobra y responde a los 3 s), `HONOR_IDEMPOTENCY` (por defecto true) y `LOST_FIRST_REPLY` (por defecto false).

### Sin Docker para los servicios

Con Redis y PostgreSQL ya corriendo en la máquina (y `psql` disponible):

```bash
PGUSER=mi_usuario PGPASSWORD=mi_clave ./scripts/dev-local.sh
```

Crea las tres bases si faltan y arranca los 5 procesos; `Ctrl+C` los apaga de forma ordenada. Variables: `REDIS_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`.

### Calidad de código

```bash
npm run lint
```

```bash
npm test
```

## Puertos

| Servicio         | Puerto | Publicado en el host        | Endpoints                                                                                                   |
| ---------------- | ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `envios`         | 3001   | sí                          | `POST /envios`, `POST /envios/:id/estado`, `GET /envios/:id`, `GET /health`                                 |
| `asignacion`     | 3002   | **no** (para poder escalar) | `GET /mensajeros`, `GET /health`                                                                            |
| `cobros`         | 3003   | sí                          | `GET /cobros`, `GET /cobros/:envioId`, `GET /health`                                                        |
| `notificaciones` | 3004   | sí                          | `GET /` (página de seguimiento), `GET /seguimiento/:id`, `GET /seguimiento/:id/stream` (SSE), `GET /health` |
| `pasarela`       | 3005   | sí                          | `POST /cobros`, `GET /stats`, `GET /health`                                                                 |
| `redis`          | 6379   | sí                          | Redis Streams (`ev:<tipo>`, `ev:dead`)                                                                      |
| `postgres`       | 5432   | no                          | `envios_db`, `asignacion_db`, `cobros_db`                                                                   |

Las credenciales de Postgres en `docker-compose.yml` son **solo de desarrollo**.

## Guion de demo en vivo (3 minutos)

Preparar antes: `docker compose up --build -d`, `npm install`, el navegador abierto en `http://localhost:3004/` y dos terminales.

| Tiempo    | Qué hacer                                                                                                                                                                                                                                                                                                                                                                           | Qué decir                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | `docker compose ps`                                                                                                                                                                                                                                                                                                                                                                 | "Siete contenedores: cuatro servicios de negocio, la pasarela simulada, Redis como broker y Postgres con una base por servicio. Arrancó con un solo comando."                                            |
| 0:20–1:00 | Crear un envío y pegar su id en la página: `curl -s -XPOST localhost:3001/envios -H 'content-type: application/json' -d '{"remitente":"Ana","destinatario":"Luis","direccion":"Cra 7 # 10-20","zona":"norte","contraEntrega":true,"valorCobro":30000}'`. Moverlo con `curl -XPOST localhost:3001/envios/<id>/estado -H 'content-type: application/json' -d '{"estado":"RECOGIDO"}'` | "El cambio aparece solo, empujado por SSE; la latencia que muestra es desde el cambio real (D1, < 3 s)."                                                                                                 |
| 1:00–1:50 | `npm run demo`                                                                                                                                                                                                                                                                                                                                                                      | "Lo importante es el paso 3: la pasarela falla 30 % y en 20 % cobra sin responder; aun así cobros reales = envíos. Y el paso 4: el mismo evento `envio.entregado` lo consumen tres grupos por separado." |
| 1:50–2:40 | `npm run chaos`                                                                                                                                                                                                                                                                                                                                                                     | "Apagamos Cobros justo cuando se entrega el paquete. El evento espera en Redis; al volver, cobra exactamente una vez (D2)."                                                                              |
| 2:40–3:00 | Mostrar `docs/06-c4.md` nivel 2                                                                                                                                                                                                                                                                                                                                                     | "Lo que vieron corresponde al diagrama: ninguna flecha continua entre servicios, solo eventos; la única llamada síncrona sale de Cobros a la pasarela."                                                  |

Plan B si algo falla en vivo: tener capturas de una corrida previa de `npm run demo` y `npm run chaos`.

## Matriz de trazabilidad

| Driver                        | Decisión                                                                 | Dónde está en el código                                                                                                                    | Cómo se prueba                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **D1** estado < 3 s           | Eventos + SSE desde `notificaciones`; outbox con relay cada 100 ms       | `services/notificaciones/rutas.js` (SSE), `historial.js`; `shared/outbox.js` (`startRelay`)                                                | `npm run demo` paso 1: mide petición→SSE (medido 56–107 ms en 5 corridas)       |
| **D1**                        | Notificaciones aislada (solo lectura)                                    | `services/notificaciones/` sin base de datos ni publicaciones                                                                              | Detener `notificaciones`, entregar y cobrar un envío: funciona (escenario E6)   |
| **D2** cobro exacto           | Outbox transaccional                                                     | `shared/outbox.js`; `enqueue` dentro de `enTransaccion` en cada `repositorio.js`                                                           | `npm run demo` paso 3; `npm run chaos`                                          |
| **D2**                        | Registro de intención en el manejador (no cobrar ahí)                    | `services/cobros/suscripciones.js`, `repositorio.js` (`registrarIntencion`)                                                                | `npm run chaos`: 0 intentos con Cobros caído, 1 cobro al volver                 |
| **D2**                        | Trabajador con alquiler y retroceso exponencial                          | `services/cobros/trabajador.js`, `dominio.js` (`calcularRetrocesoMs`, `calcularAlquilerMs`), `repositorio.js` (`reclamarCobrosPendientes`) | `npm test` (retroceso); `npm run demo` paso 3 (intentos > cobros)               |
| **D2**                        | Llave de idempotencia = `cobros.id`                                      | `services/cobros/pasarela-cliente.js`                                                                                                      | `npm run demo` (20 = 20) vs. `HONOR_IDEMPOTENCY=false` (30 ≠ 20)                |
| **D2**                        | `NO_ENTREGADO` nunca cobra (sin suscripción)                             | `services/cobros/suscripciones.js`                                                                                                         | `npm run demo` paso 5                                                           |
| **D2/D3**                     | Consumidores idempotentes                                                | `ON CONFLICT` en `asignacion` y `cobros`; `WHERE estado` en `envios`; `eventId` en `notificaciones/historial.js`                           | Duplicados inyectados por el relay al-menos-una-vez; `npm run escala`           |
| **D3** asignación concurrente | Grupo de consumo compartido + `FOR UPDATE SKIP LOCKED` + `CHECK` de cupo | `shared/suscripcion.js`, `services/asignacion/repositorio.js`, `dominio.js` (`ordenarCandidatos`)                                          | `npm run escala` con `--scale asignacion=3`; `npm test` (elección de mensajero) |
| Integridad                    | Máquina de estados con bloqueo de fila                                   | `services/envios/dominio.js`, `repositorio.js` (`cambiarEstado`)                                                                           | `npm test`; `npm run demo` (409)                                                |
| Reentrega y mensajes muertos  | `XACK` solo si no hubo error, `XAUTOCLAIM`, `ev:dead`                    | `shared/suscripcion.js`                                                                                                                    | Envíos sin cupo terminan en `ev:dead` (riesgo R4, ejecutado)                    |
| Arranque en un comando        | Una imagen, Compose con _healthchecks_ y anclas YAML                     | `Dockerfile`, `docker-compose.yml`                                                                                                         | `docker compose up --build` → 7 `healthy`                                       |

## Estructura

```
shared/        contrato de eventos (eventos.js) e infraestructura (bus, db, outbox, http, log, apagado, tiempo, config)
services/      envios · asignacion · cobros · notificaciones · pasarela-mock
scripts/       demo.mjs · chaos.mjs · escala.mjs · dev-local.sh · lib/
db/init.sql    crea una base por servicio
docs/          Entregable 1
```
