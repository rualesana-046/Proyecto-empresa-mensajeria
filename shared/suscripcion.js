import os from 'node:os';
import { CONFIG_INFRA } from './config.js';
import { STREAM_MENSAJES_MUERTOS, streamDe } from './eventos.js';
import { esperar, repetirCada } from './tiempo.js';

const ERROR_GRUPO_EXISTENTE = 'BUSYGROUP';
const DESDE_EL_INICIO = '0';
const SOLO_NO_ENTREGADOS = '>';
const CURSOR_INICIAL = '0-0';
const POSICION_CONTEO_ENTREGAS = 3;

/** Crea la suscripción de un grupo de consumo a varios streams; devuelve `iniciar` y `detener`. */
export function crearSuscripcion({
  redis,
  logger,
  service,
  types,
  handler,
  minIdleMs = CONFIG_INFRA.bus.inactividadMinimaMs,
  maxAttempts = CONFIG_INFRA.bus.maxEntregas,
}) {
  const contexto = {
    redis,
    logger,
    service,
    handler,
    minIdleMs,
    maxAttempts,
    // Conexión dedicada: XREADGROUP BLOCK deja la conexión ocupada mientras espera
    lector: redis.duplicate(),
    // Nombre único por proceso para que las réplicas en contenedores no compartan pendientes
    consumidor: `${service}-${os.hostname()}-${process.pid}`,
    streams: types.map(streamDe),
    activa: true,
  };
  let cicloLectura = Promise.resolve();
  let detenerRecuperacion = async () => {};

  async function iniciar() {
    await crearGrupos(contexto);
    cicloLectura = leerContinuamente(contexto);
    const { intervaloRecuperacionMs } = CONFIG_INFRA.bus;
    detenerRecuperacion = repetirCada(intervaloRecuperacionMs, () => recuperarTodo(contexto));
    logger.info(`Suscrito como ${contexto.consumidor} a ${types.join(', ')}`);
  }

  async function detener() {
    contexto.activa = false;
    await detenerRecuperacion();
    contexto.lector.disconnect();
    await cicloLectura;
  }

  return Object.freeze({ iniciar, detener });
}

async function crearGrupos({ redis, service, streams }) {
  for (const stream of streams) {
    try {
      // Desde el inicio del stream: un servicio que arranca tarde no pierde eventos previos
      await redis.xgroup('CREATE', stream, service, DESDE_EL_INICIO, 'MKSTREAM');
    } catch (error) {
      if (!error.message.includes(ERROR_GRUPO_EXISTENTE)) throw error;
    }
  }
}

async function leerContinuamente(contexto) {
  while (contexto.activa) {
    try {
      const respuesta = await leerLote(contexto);
      await procesarRespuesta(contexto, respuesta ?? []);
    } catch (error) {
      if (!contexto.activa) return;
      contexto.logger.error(`Error leyendo de ${contexto.streams.join(', ')}`, error);
      await esperar(CONFIG_INFRA.bus.intervaloRecuperacionMs);
    }
  }
}

function leerLote({ lector, service, consumidor, streams }) {
  const { loteLectura, bloqueoLecturaMs } = CONFIG_INFRA.bus;
  const posiciones = streams.map(() => SOLO_NO_ENTREGADOS);
  const opciones = ['COUNT', loteLectura, 'BLOCK', bloqueoLecturaMs, 'STREAMS'];
  return lector.xreadgroup('GROUP', service, consumidor, ...opciones, ...streams, ...posiciones);
}

async function procesarRespuesta(contexto, respuesta) {
  for (const [stream, mensajes] of respuesta) {
    for (const [id, campos] of mensajes) await procesar(contexto, stream, id, campos);
  }
}

async function procesar({ redis, logger, service, handler }, stream, id, campos) {
  try {
    await handler(aEvento(campos));
    // Confirma el evento solo si el manejador no lanzó error
    await redis.xack(stream, service, id);
  } catch (error) {
    logger.error(`No se pudo manejar el mensaje ${id} de ${stream}; quedará pendiente`, error);
  }
}

async function recuperarTodo(contexto) {
  try {
    for (const stream of contexto.streams) await recuperarPendientes(contexto, stream);
  } catch (error) {
    if (contexto.activa) contexto.logger.error('Error recuperando mensajes pendientes', error);
  }
}

async function recuperarPendientes(contexto, stream) {
  const { redis, service, consumidor, minIdleMs } = contexto;
  // Toma mensajes que otro consumidor (o este mismo) dejó sin confirmar por más de minIdleMs
  const opciones = [minIdleMs, CURSOR_INICIAL, 'COUNT', CONFIG_INFRA.bus.loteLectura];
  const [, mensajes] = await redis.xautoclaim(stream, service, consumidor, ...opciones);
  for (const [id, campos] of mensajes) await reprocesarOEnterrar(contexto, stream, id, campos);
}

async function reprocesarOEnterrar(contexto, stream, id, campos) {
  const entregas = await contarEntregas(contexto, stream, id);
  if (entregas > contexto.maxAttempts) {
    return moverAMensajesMuertos(contexto, { stream, id, campos, entregas });
  }
  return procesar(contexto, stream, id, campos);
}

async function contarEntregas({ redis, service }, stream, id) {
  const [detalle] = await redis.xpending(stream, service, id, id, 1);
  return detalle ? detalle[POSICION_CONTEO_ENTREGAS] : 0;
}

async function moverAMensajesMuertos({ redis, logger, service }, { stream, id, campos, entregas }) {
  const origen = ['origen', stream, 'grupo', service, 'entregas', String(entregas)];
  await redis.xadd(STREAM_MENSAJES_MUERTOS, '*', ...campos, ...origen);
  await redis.xack(stream, service, id);
  logger.error(
    `Mensaje ${id} de ${stream} enviado a ${STREAM_MENSAJES_MUERTOS}`,
    `${entregas} entregas`,
  );
}

function aEvento(campos) {
  const mapa = {};
  for (let i = 0; i < campos.length; i += 2) mapa[campos[i]] = campos[i + 1];
  return {
    eventId: mapa.eventId,
    type: mapa.type,
    ts: Number(mapa.ts),
    data: JSON.parse(mapa.data),
  };
}
