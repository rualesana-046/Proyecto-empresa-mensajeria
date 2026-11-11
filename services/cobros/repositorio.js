import { randomUUID } from 'node:crypto';
import { enTransaccion } from '../../shared/db.js';
import { EVENTOS } from '../../shared/eventos.js';
import { ESQUEMA_OUTBOX, enqueue } from '../../shared/outbox.js';
import { ESTADOS_COBRO, datosDeCobroConfirmado } from './dominio.js';

export const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS cobros (
    id UUID PRIMARY KEY,
    envio_id UUID NOT NULL UNIQUE,
    monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
    estado TEXT NOT NULL,
    referencia TEXT,
    intentos INTEGER NOT NULL DEFAULT 0,
    proximo_intento TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmado_en TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS cobros_por_cobrar ON cobros (proximo_intento)
    WHERE estado = '${ESTADOS_COBRO.PENDIENTE}';
  ${ESQUEMA_OUTBOX}
`;

/** Crea el repositorio de cobros sobre `pool`; es el único lugar con SQL de este servicio. */
export function crearRepositorio(pool) {
  async function registrarIntencion(envioId, monto) {
    // UNIQUE(envio_id) + DO NOTHING: un envio.entregado repetido no crea una segunda deuda
    const { rowCount } = await pool.query(
      `INSERT INTO cobros (id, envio_id, monto, estado) VALUES ($1, $2, $3, $4)
       ON CONFLICT (envio_id) DO NOTHING`,
      [randomUUID(), envioId, monto, ESTADOS_COBRO.PENDIENTE],
    );
    return rowCount > 0;
  }

  async function reclamarCobrosPendientes(lote, alquilerMsPara) {
    return enTransaccion(pool, async (client) => {
      const pendientes = await seleccionarVencidos(client, lote);
      if (pendientes.length === 0) return [];
      const alquileres = pendientes.map((fila) => alquilerMsPara(fila.intentos + 1));
      return alquilar(
        client,
        pendientes.map((fila) => fila.id),
        alquileres,
      );
    });
  }

  async function confirmarCobro(cobroId, referencia) {
    return enTransaccion(pool, async (client) => {
      // Condicionado a PENDIENTE: si dos intentos responden bien, solo uno confirma y publica
      const { rows } = await client.query(
        `UPDATE cobros SET estado = $3, referencia = $2, confirmado_en = now(), ultimo_error = NULL
         WHERE id = $1 AND estado = $4 RETURNING *`,
        [cobroId, referencia, ESTADOS_COBRO.CONFIRMADO, ESTADOS_COBRO.PENDIENTE],
      );
      if (rows.length === 0) return false;
      await enqueue(client, EVENTOS.COBRO_CONFIRMADO, datosDeCobroConfirmado(aCobro(rows[0])));
      return true;
    });
  }

  async function registrarFallo(cobroId, mensaje) {
    await pool.query('UPDATE cobros SET ultimo_error = $2 WHERE id = $1', [cobroId, mensaje]);
  }

  async function listar() {
    const { rows } = await pool.query('SELECT * FROM cobros ORDER BY created_at');
    return rows.map(aCobro);
  }

  async function buscarPorEnvio(envioId) {
    const { rows } = await pool.query('SELECT * FROM cobros WHERE envio_id = $1', [envioId]);
    return rows[0] ? aCobro(rows[0]) : null;
  }

  return Object.freeze({
    registrarIntencion,
    reclamarCobrosPendientes,
    confirmarCobro,
    registrarFallo,
    listar,
    buscarPorEnvio,
  });
}

async function seleccionarVencidos(client, lote) {
  // SKIP LOCKED: otra réplica de Cobros toma cobros distintos en vez de esperar este lote
  const { rows } = await client.query(
    `SELECT id, intentos FROM cobros
     WHERE estado = $1 AND proximo_intento <= now()
     ORDER BY proximo_intento LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [ESTADOS_COBRO.PENDIENTE, lote],
  );
  return rows;
}

async function alquilar(client, ids, alquileresMs) {
  // Mover proximo_intento es el alquiler: si este proceso muere, el cobro vuelve a estar disponible
  const { rows } = await client.query(
    `UPDATE cobros AS c
     SET intentos = c.intentos + 1, proximo_intento = now() + v.ms * interval '1 millisecond'
     FROM unnest($1::uuid[], $2::int[]) AS v(id, ms)
     WHERE c.id = v.id RETURNING c.*`,
    [ids, alquileresMs],
  );
  return rows.map(aCobro);
}

function aCobro(fila) {
  return {
    cobroId: fila.id,
    envioId: fila.envio_id,
    monto: Number(fila.monto),
    estado: fila.estado,
    referencia: fila.referencia,
    intentos: fila.intentos,
    proximoIntento: fila.proximo_intento,
    ultimoError: fila.ultimo_error,
    creadoEn: fila.created_at,
    confirmadoEn: fila.confirmado_en,
  };
}
