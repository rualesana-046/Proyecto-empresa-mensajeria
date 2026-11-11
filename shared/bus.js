import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { CONFIG_INFRA } from './config.js';
import { streamDe } from './eventos.js';
import { crearSuscripcion } from './suscripcion.js';

/** Crea el bus de eventos sobre Redis Streams; devuelve `publish`, `subscribe` y `close`. */
export function crearBus({ logger, redisUrl = CONFIG_INFRA.redisUrl }) {
  const redis = new Redis(redisUrl);
  const suscripciones = [];

  async function publish(type, data, { eventId = randomUUID(), ts = Date.now() } = {}) {
    const campos = ['eventId', eventId, 'type', type, 'ts', String(ts)];
    return redis.xadd(streamDe(type), '*', ...campos, 'data', JSON.stringify(data));
  }

  async function subscribe(opciones) {
    const suscripcion = crearSuscripcion({ redis, logger, ...opciones });
    suscripciones.push(suscripcion);
    await suscripcion.iniciar();
  }

  async function close() {
    await Promise.all(suscripciones.map((suscripcion) => suscripcion.detener()));
    await redis.quit();
  }

  return Object.freeze({ publish, subscribe, close });
}
