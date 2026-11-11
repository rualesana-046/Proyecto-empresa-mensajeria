import { abortarArranque, registrarApagado } from '../../shared/apagado.js';
import { crearBus } from '../../shared/bus.js';
import { connect } from '../../shared/db.js';
import { crearApp, escuchar, manejarErrores } from '../../shared/http.js';
import { crearLogger } from '../../shared/log.js';
import { startRelay } from '../../shared/outbox.js';
import { CONFIG } from './config.js';
import { ESQUEMA, crearRepositorio } from './repositorio.js';
import { registrarRutas } from './rutas.js';
import { registrarSuscripciones } from './suscripciones.js';

const logger = crearLogger(CONFIG.servicio);

async function arrancar() {
  const pool = await connect(CONFIG.baseDeDatos, ESQUEMA, { logger });
  const bus = crearBus({ logger });
  const repositorio = crearRepositorio(pool);

  const app = crearApp(CONFIG.servicio);
  registrarRutas(app, { repositorio });
  manejarErrores(app, logger);

  await registrarSuscripciones(bus, { repositorio, logger, servicio: CONFIG.servicio });
  const detenerRelay = startRelay({ pool, bus, logger });
  const cerrarHttp = await escuchar(app, CONFIG.puerto, logger);

  registrarApagado(logger, [
    { nombre: 'servidor HTTP', cerrar: cerrarHttp },
    { nombre: 'relay del outbox', cerrar: detenerRelay },
    { nombre: 'bus de eventos', cerrar: bus.close },
    { nombre: 'pool de Postgres', cerrar: () => pool.end() },
  ]);
}

try {
  await arrancar();
} catch (error) {
  abortarArranque(logger, error);
}
