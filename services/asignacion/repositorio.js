import { enTransaccion } from '../../shared/db.js';
import { EVENTOS } from '../../shared/eventos.js';
import { ESQUEMA_OUTBOX, enqueue } from '../../shared/outbox.js';
import { SinMensajeroDisponibleError, datosDeAsignacion, ordenarCandidatos } from './dominio.js';

export const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS mensajeros (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    zona TEXT NOT NULL,
    capacidad INTEGER NOT NULL CHECK (capacidad > 0),
    carga INTEGER NOT NULL DEFAULT 0,
    -- Última defensa: la base rechaza cualquier carga fuera del cupo aunque falle la lógica
    CONSTRAINT carga_dentro_del_cupo CHECK (carga >= 0 AND carga <= capacidad)
  );
  CREATE TABLE IF NOT EXISTS asignaciones (
    envio_id UUID PRIMARY KEY,
    mensajero_id TEXT NOT NULL REFERENCES mensajeros (id),
    liberada BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ${ESQUEMA_OUTBOX}
`;

/** Crea el repositorio de asignación sobre `pool`; es el único lugar con SQL de este servicio. */
export function crearRepositorio(pool) {
  async function sembrarMensajeros(mensajeros) {
    for (const { id, nombre, zona, capacidad } of mensajeros) {
      await pool.query(
        `INSERT INTO mensajeros (id, nombre, zona, capacidad) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, nombre, zona, capacidad],
      );
    }
  }

  async function asignarEnvio(datosEnvio) {
    return enTransaccion(pool, async (client) => {
      if (await yaAsignado(client, datosEnvio.envioId)) return { duplicado: true };
      const mensajero = await reservarMensajero(client, datosEnvio.zona);
      if (!(await registrarAsignacion(client, datosEnvio.envioId, mensajero.id))) {
        return { duplicado: true };
      }
      await client.query('UPDATE mensajeros SET carga = carga + 1 WHERE id = $1', [mensajero.id]);
      await enqueue(client, EVENTOS.ENVIO_ASIGNADO, datosDeAsignacion(datosEnvio, mensajero.id));
      return { mensajeroId: mensajero.id };
    });
  }

  async function liberarCupo(envioId) {
    return enTransaccion(pool, async (client) => {
      // `NOT liberada` hace que el cupo se devuelva una sola vez aunque el evento se repita
      const { rows } = await client.query(
        `UPDATE asignaciones SET liberada = true
         WHERE envio_id = $1 AND NOT liberada RETURNING mensajero_id`,
        [envioId],
      );
      if (rows.length === 0) return false;
      await client.query('UPDATE mensajeros SET carga = carga - 1 WHERE id = $1', [
        rows[0].mensajero_id,
      ]);
      return true;
    });
  }

  async function listarMensajeros() {
    const { rows } = await pool.query(
      'SELECT id, nombre, zona, capacidad, carga FROM mensajeros ORDER BY id',
    );
    return rows;
  }

  return Object.freeze({ sembrarMensajeros, asignarEnvio, liberarCupo, listarMensajeros });
}

async function yaAsignado(client, envioId) {
  // Evita que un duplicado tardío falle por falta de cupo que él mismo ya consumió
  const { rowCount } = await client.query('SELECT 1 FROM asignaciones WHERE envio_id = $1', [
    envioId,
  ]);
  return rowCount > 0;
}

async function reservarMensajero(client, zona) {
  const { rows } = await client.query(
    'SELECT id, zona, capacidad, carga FROM mensajeros WHERE zona = $1',
    [zona],
  );
  for (const candidato of ordenarCandidatos(rows, zona)) {
    if (await bloquearSiTieneCupo(client, candidato.id)) return candidato;
  }
  throw new SinMensajeroDisponibleError(zona);
}

async function bloquearSiTieneCupo(client, mensajeroId) {
  // SKIP LOCKED permite que otra réplica tome un mensajero distinto sin esperar
  const { rowCount } = await client.query(
    'SELECT 1 FROM mensajeros WHERE id = $1 AND carga < capacidad FOR UPDATE SKIP LOCKED',
    [mensajeroId],
  );
  return rowCount > 0;
}

async function registrarAsignacion(client, envioId, mensajeroId) {
  // ON CONFLICT cubre el caso de dos réplicas procesando el mismo evento a la vez
  const { rowCount } = await client.query(
    `INSERT INTO asignaciones (envio_id, mensajero_id) VALUES ($1, $2)
     ON CONFLICT (envio_id) DO NOTHING`,
    [envioId, mensajeroId],
  );
  return rowCount > 0;
}
