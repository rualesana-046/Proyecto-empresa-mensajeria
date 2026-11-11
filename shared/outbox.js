import { randomUUID } from 'node:crypto';
import { CONFIG_INFRA } from './config.js';
import { enTransaccion } from './db.js';
import { repetirCada } from './tiempo.js';

export const ESQUEMA_OUTBOX = `
  CREATE TABLE IF NOT EXISTS outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    ts BIGINT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false
  );
  CREATE INDEX IF NOT EXISTS outbox_pendientes ON outbox (id) WHERE NOT published;
`;

/** Guarda un evento en el outbox usando la transacción abierta en `client`. */
export async function enqueue(client, type, data) {
  // El eventId se fija aquí para que cada republicación lleve el mismo id
  const sql = 'INSERT INTO outbox (event_id, type, data, ts) VALUES ($1, $2, $3, $4)';
  await client.query(sql, [randomUUID(), type, data, Date.now()]);
}

/** Publica periódicamente los eventos pendientes del outbox; devuelve la función que lo detiene. */
export function startRelay({ pool, bus, logger }) {
  const { intervaloRelayMs, loteRelay } = CONFIG_INFRA.outbox;

  const publicarPendientes = async () => {
    try {
      await enTransaccion(pool, (client) => publicarLote(client, bus, loteRelay));
    } catch (error) {
      logger.error('No se pudo publicar el outbox; se reintentará', error);
    }
  };

  return repetirCada(intervaloRelayMs, publicarPendientes);
}

async function publicarLote(client, bus, lote) {
  // SKIP LOCKED evita que dos réplicas publiquen el mismo lote al mismo tiempo
  const { rows } = await client.query(
    `SELECT id, event_id, type, data, ts FROM outbox
     WHERE NOT published ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [lote],
  );
  for (const fila of rows) {
    await bus.publish(fila.type, fila.data, { eventId: fila.event_id, ts: Number(fila.ts) });
  }
  if (rows.length > 0) {
    await client.query('UPDATE outbox SET published = true WHERE id = ANY($1)', [
      rows.map((f) => f.id),
    ]);
  }
}
