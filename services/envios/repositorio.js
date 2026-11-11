import { randomUUID } from 'node:crypto';
import { enTransaccion } from '../../shared/db.js';
import { ESTADOS_ENVIO as ESTADOS, EVENTOS } from '../../shared/eventos.js';
import { ESQUEMA_OUTBOX, enqueue } from '../../shared/outbox.js';
import { ERRORES, datosDeEvento, esTransicionValida, eventoDeEstado } from './dominio.js';

export const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS envios (
    id UUID PRIMARY KEY,
    remitente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    direccion TEXT NOT NULL,
    zona TEXT NOT NULL,
    contra_entrega BOOLEAN NOT NULL,
    valor_cobro NUMERIC(14, 2) NOT NULL,
    estado TEXT NOT NULL,
    mensajero_id TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ${ESQUEMA_OUTBOX}
`;

/** Crea el repositorio de envíos sobre `pool`; es el único lugar con SQL de este servicio. */
export function crearRepositorio(pool) {
  async function crearEnvio(nuevo) {
    return enTransaccion(pool, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO envios (id, remitente, destinatario, direccion, zona, contra_entrega, valor_cobro, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          randomUUID(),
          nuevo.remitente,
          nuevo.destinatario,
          nuevo.direccion,
          nuevo.zona,
          nuevo.contraEntrega,
          nuevo.valorCobro,
          nuevo.estado,
        ],
      );
      const envio = aEnvio(rows[0]);
      // Misma transacción: o quedan el envío y su evento, o no queda ninguno
      await enqueue(client, EVENTOS.ENVIO_CREADO, datosDeEvento(envio));
      return envio;
    });
  }

  async function cambiarEstado(envioId, nuevoEstado) {
    return enTransaccion(pool, async (client) => {
      const actual = await bloquearEnvio(client, envioId);
      if (!actual) return { error: ERRORES.NO_ENCONTRADO };
      if (!esTransicionValida(actual.estado, nuevoEstado)) {
        return { error: ERRORES.TRANSICION_INVALIDA, envio: actual };
      }
      const envio = await actualizarEstado(client, envioId, nuevoEstado);
      await enqueue(client, eventoDeEstado(nuevoEstado), datosDeEvento(envio));
      return { envio };
    });
  }

  async function marcarAsignado(envioId, mensajeroId) {
    // La condición sobre CREADO vuelve inofensivo un evento envio.asignado repetido
    const { rowCount } = await pool.query(
      `UPDATE envios SET estado = $3, mensajero_id = $2, actualizado_en = now()
       WHERE id = $1 AND estado = $4`,
      [envioId, mensajeroId, ESTADOS.ASIGNADO, ESTADOS.CREADO],
    );
    return rowCount > 0;
  }

  async function buscarPorId(envioId) {
    const { rows } = await pool.query('SELECT * FROM envios WHERE id = $1', [envioId]);
    return rows[0] ? aEnvio(rows[0]) : null;
  }

  return Object.freeze({ crearEnvio, cambiarEstado, marcarAsignado, buscarPorId });
}

async function bloquearEnvio(client, envioId) {
  // Bloquea la fila para que dos cambios de estado simultáneos no se pisen
  const { rows } = await client.query('SELECT * FROM envios WHERE id = $1 FOR UPDATE', [envioId]);
  return rows[0] ? aEnvio(rows[0]) : null;
}

async function actualizarEstado(client, envioId, estado) {
  const { rows } = await client.query(
    'UPDATE envios SET estado = $2, actualizado_en = now() WHERE id = $1 RETURNING *',
    [envioId, estado],
  );
  return aEnvio(rows[0]);
}

function aEnvio(fila) {
  return {
    envioId: fila.id,
    remitente: fila.remitente,
    destinatario: fila.destinatario,
    direccion: fila.direccion,
    zona: fila.zona,
    contraEntrega: fila.contra_entrega,
    // NUMERIC llega como texto desde pg para no perder precisión
    valorCobro: Number(fila.valor_cobro),
    estado: fila.estado,
    mensajeroId: fila.mensajero_id,
  };
}
