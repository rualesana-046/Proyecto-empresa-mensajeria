# 08 · Guía de defensa (BORRADOR)

> [NOMBRE 1], [NOMBRE 2], [NOMBRE 3] · [GRUPO 5A/5B]
>
> **⚠ Esto es un borrador.** Está escrito para que el equipo entienda cada decisión, no para leerlo en voz alta. **Reescriban cada respuesta con sus propias palabras** y verifiquen cada cifra corriendo ustedes mismos `npm run demo`, `npm run chaos` y `npm run escala`. Si una respuesta no la pueden explicar sin mirar el papel, todavía no es suya.

Las cuatro preguntas de la sustentación:

1. ¿Qué driver justifica esta decisión, y de dónde salió ese driver?
2. ¿Qué alternativa descartaron, y por qué?
3. ¿Qué atributo empeoró, y por qué es aceptable?
4. Si el negocio creciera 10×, ¿qué se rompería primero?

---

## Estilo: microservicios por eventos

1. **Driver:** D2 sobre todo (cobro exacto aunque caiga un servicio), que sale de la regla del cobro contra entrega y de que la pasarela externa falla. También D3 (escalar solo la asignación).
2. **Descartada:** monolito modular con cola persistente. Resolvía D2 más barato, pero una caída detiene todo y no se puede escalar solo la asignación. REST síncrono: Envíos dependería de que Cobros responda.
3. **Empeoró:** simplicidad y consistencia inmediata (el mensajero puede recibir 409 si reporta antes de que llegue la asignación). Aceptable porque el negocio tolera segundos en la asignación y no tolera perder dinero.
4. **10×:** no se rompe el estilo; se rompen las instancias únicas (ver la sección "Pregunta 4").

## SSE hacia el cliente

1. **Driver:** D1 (< 3 s), que pide el remitente/destinatario que quiere ver su paquete en vivo.
2. **Descartadas:** polling (para < 3 s hay que preguntar cada ~1 s aunque nada cambie) y WebSocket (bidireccional, no se necesita).
3. **Empeoró:** una conexión abierta por cliente, y Notificaciones no se puede replicar tal como está (R2). Aceptable: hoy hay una sola réplica y la latencia medida es ~100 ms.
4. **10×:** las conexiones SSE abiertas, antes que los eventos.

## Redis Streams como broker

1. **Driver:** ADR-001 necesita fan-out a varios consumidores (D1, D2), consumidores competidores (D3) y reentrega si alguien muere (D2). Restricción: equipo pequeño.
2. **Descartadas:** RabbitMQ (cumple y trae de serie lo que programamos; perdió porque un consumidor nuevo no ve mensajes ya consumidos y porque `XINFO GROUPS` hace visible el fan-out), Kafka (para volúmenes 10.000× mayores), tabla en Postgres (obligaría a compartir una base entre servicios).
3. **Empeoró:** durabilidad (`everysec` puede perder ~1 s) y disponibilidad (instancia única). Aceptable para el esqueleto; en producción es el primer riesgo (R1).
4. **10×:** la instancia única de Redis es un punto único de falla, no de capacidad.

## Outbox transaccional

1. **Driver:** D2. Sin outbox, Envíos podría guardar `ENTREGADO` y caerse antes de publicar el evento: el cobro nunca se registraría.
2. **Descartada:** publicar directo al broker después del `COMMIT` (si el proceso cae entre los dos, se pierde el evento) o antes (se publica algo que luego hace `ROLLBACK`).
3. **Empeoró:** latencia (hasta 100 ms del ciclo del relay, que es casi toda la latencia medida) y duplicados (al-menos-una-vez). Aceptable: 100 ms frente a 3 s, y los consumidores son idempotentes.
4. **10×:** nada por volumen: 10× son ~0,12 envíos/s (< 1 evento/s). El relay toma hasta 50 eventos cada 100 ms, pero los publica uno a uno y **su throughput no está medido**; lo que sí crece sin control es la tabla `outbox`, que nunca se purga (R8).

## Llave de idempotencia + registro de intención + trabajador

1. **Driver:** D2. Es la parte con evidencia más fuerte: con la llave, 20 cobros para 20 envíos en 5 de 5 corridas; sin ella, **25–36 para 20** en 3 de 3.
2. **Descartadas:** cobrar dentro del manejador (es el error del prototipo: al agotar reintentos el cobro se perdía), 2PC (la pasarela no participa), llamada síncrona de Envíos a Cobros.
3. **Empeoró:** el tiempo hasta confirmar el cobro (la ráfaga tardó entre 10,3 y 26,4 s según la corrida) y la complejidad. Aceptable: al negocio le importa que el cobro sea exacto, no que sea instantáneo.
4. **10×:** medido, el trabajador vacía ~1,5 cobros/s con la pasarela fallando 50 % y ~15/s con una pasarela sana (cada lote espera a su llamada más lenta, hasta 2 s). 10× son ~0,12 envíos/s, así que alcanza; lo que se rompería es la dependencia de que la pasarela recuerde las llaves (R3).

## Una base por servicio

1. **Driver:** desacople para D2 y D3: que un cambio en la tabla de envíos no rompa Cobros, y que Cobros no pueda "consultar el envío antes de cobrar" (eso sería volver al acoplamiento síncrono).
2. **Descartada:** una sola base compartida. Más simple, pero cualquier servicio podría leer o escribir las tablas de otro.
3. **Empeoró:** no hay _joins_ entre contextos; datos repetidos (la zona viaja en el evento). Aceptable: ninguna funcionalidad del esqueleto los necesita.
4. **10×:** las tres bases viven en **una sola instancia** de Postgres; es separación lógica, no física.

## Contextos delimitados

1. **Driver:** cada frontera tiene una señal: Cobros por garantías distintas (D2), Asignación por escala distinta (D3), Notificaciones por ser solo lectura (si cae, el negocio sigue), Envíos por su propio ritmo de cambio.
2. **Descartada:** juntar Asignación dentro de Envíos (no se podría escalar sola) o Notificaciones dentro de Envíos (un problema con conexiones SSE afectaría las escrituras).
3. **Empeoró:** más procesos y más eventos que mantener sincronizados en el contrato.
4. **10×:** las fronteras aguantan; lo que falla es la infraestructura compartida.

---

## Pregunta 4 en serio: ¿qué se rompe primero con 10×?

Respuesta franca: **no se rompe el throughput.** 10× es 10.000 envíos/día ≈ **0,12 envíos/s**; cada envío produce ~6 eventos, o sea < 1 evento/s. Redis maneja decenas de miles por segundo. Lo que se rompe antes, en orden:

1. **Asignación sin cola de espera (R4).** Con 10× envíos y los mismos 4 mensajeros (capacidad 20) los picos superan el cupo: lo **medimos** con 45 envíos para 40 cupos → 5 envíos se quedaron en `CREADO` para siempre y sus eventos terminaron en `ev:dead`. Es lo primero que fallaría en la operación real.
2. **Instancias únicas de Redis y Postgres (R1).** No por carga, sino porque más volumen = más dinero en juego si se cae el único Redis o el único Postgres.
3. **SSE con una sola réplica de Notificaciones (R2, R6).** Más clientes mirando a la vez exigen más réplicas, y hoy dos réplicas reparten los eventos entre sí.
4. **`ev:dead` sin vigilancia (R5)** y streams sin recorte: crecen proporcionalmente.

## Preguntas incómodas que puede hacer el docente

**"Son 0,01 envíos por segundo. ¿Por qué no un monolito?"**
Porque el problema no es el volumen. Ninguna decisión de este diseño se justifica por throughput. Se justifica por D2: que el cobro sobreviva a la caída de un proceso y a una pasarela que cobra sin responder. Un monolito modular con una tabla-cola podría lograrlo y sería más barato; lo reconocemos en ADR-001. Elegimos eventos porque además permite escalar solo la asignación (D3) y que la caída de Notificaciones no toque el cobro.

**"Si Redis pierde 1 segundo de eventos, ¿no pierden cobros igual?"**
Sí, es posible (R1). El outbox marca `published` cuando Redis acepta el `XADD`, no cuando lo escribe a disco. Un `envio.entregado` perdido así no generaría la intención de cobro. No lo probamos. Lo que haríamos: `appendfsync always` o marcar publicado solo tras `WAITAOF`.

**"El enunciado dice que el operador asigna rutas. ¿Por qué lo hace el sistema?"**
Porque a 1.000 envíos/día hay una asignación cada ~29 s en jornada laboral, y D3 pide que crezca sin rediseño y sin errores de cupo; un humano sería el cuello de botella. El operador supervisa (cobros y carga de mensajeros). Lo que se pierde es el criterio humano y la reasignación manual, que no está implementada.

**"¿Exactamente-una-vez?"**
No. El sistema es al-menos-una-vez y cada consumidor es idempotente. El "exactamente un cobro" lo garantiza la base de Cobros (`UNIQUE(envio_id)`) más la llave en la pasarela, no el broker.

**"¿Qué pasa si la pasarela real no tiene llave de idempotencia?"**
Tendríamos doble cobro en el caso de respuesta perdida (R3). Lo mostramos con `HONOR_IDEMPOTENCY=false`: entre 25 y 36 cobros para 20 envíos según la corrida (y siempre más de 20 en modo `LOST_FIRST_REPLY=true`). La alternativa sería consultar a la pasarela por nuestra referencia antes de reintentar.

**"¿Por qué el mensajero recibe 409 a veces?"**
Por consistencia eventual: Envíos aún no procesó `envio.asignado`. Es el costo visible del estilo. La app del mensajero tendría que esperar la asignación (ella misma se entera por SSE).

**"¿Por qué el alquiler no es 1 s, 2 s, 4 s como dice el enunciado?"**
Porque lo encontramos al implementarlo: con 1 s de alquiler y 2 s de timeout, el mismo cobro se podía reclamar otra vez mientras la primera llamada seguía en curso. El alquiler es timeout + retroceso. El retroceso sí es 1, 2, 4… s.

**"¿Probaron con Docker o solo en su máquina?"**
Con Docker Compose, desde cero (`docker compose down -v` + `up --build`): los 7 contenedores quedan _healthy_ en 22 s sin imágenes descargadas y en ~10 s con caché. También con `scripts/dev-local.sh` sin Docker para los servicios.
