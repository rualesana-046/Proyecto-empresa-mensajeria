import pg from 'pg';
import { CONFIG_INFRA } from './config.js';
import { esperar } from './tiempo.js';

// Llave arbitraria del bloqueo consultivo que serializa la creación del esquema entre réplicas
const LLAVE_BLOQUEO_ESQUEMA = 51502026;

/** Crea el pool de `database` y aplica `schemaSql`, reintentando mientras Postgres arranca. */
export async function connect(database, schemaSql, { logger }) {
  const { maxIntentosConexion, esperaEntreIntentosMs } = CONFIG_INFRA.db;
  // Host, puerto, usuario y clave salen de PGHOST, PGPORT, PGUSER y PGPASSWORD
  const pool = new pg.Pool({ database });
  pool.on('error', (error) => logger.error(`Conexión inactiva a ${database} falló`, error));

  for (let intento = 1; ; intento += 1) {
    try {
      await aplicarEsquema(pool, schemaSql);
      logger.info(`Conectado a ${database}`);
      return pool;
    } catch (error) {
      if (intento >= maxIntentosConexion) {
        await pool.end();
        throw error;
      }
      logger.error(`Postgres no disponible (${database}), intento ${intento}`, error);
      await esperar(esperaEntreIntentosMs);
    }
  }
}

async function aplicarEsquema(pool, schemaSql) {
  await enTransaccion(pool, async (client) => {
    // Sin este bloqueo, tres réplicas creando las mismas tablas a la vez chocan en el catálogo
    await client.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_ESQUEMA]);
    await client.query(schemaSql);
  });
}

/** Ejecuta `trabajo(client)` dentro de BEGIN/COMMIT; hace ROLLBACK y relanza si algo falla. */
export async function enTransaccion(pool, trabajo) {
  const client = await pool.connect();
  let errorDeConexion;
  try {
    await client.query('BEGIN');
    const resultado = await trabajo(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    errorDeConexion = await intentarRollback(client);
    throw error;
  } finally {
    // Si el ROLLBACK falló, la conexión se descarta en vez de volver al pool
    client.release(errorDeConexion);
  }
}

async function intentarRollback(client) {
  try {
    await client.query('ROLLBACK');
    return undefined;
  } catch (error) {
    return error;
  }
}
