import { abortarArranque, registrarApagado } from '../../shared/apagado.js';
import { crearBus } from '../../shared/bus.js';
import { crearApp, escuchar, manejarErrores } from '../../shared/http.js';
import { crearLogger } from '../../shared/log.js';
import { CONFIG } from './config.js';
import { crearHistorial } from './historial.js';
import { registrarRutas } from './rutas.js';
import { registrarSuscripciones } from './suscripciones.js';

const logger = crearLogger(CONFIG.servicio);

async function arrancar() {
  const bus = crearBus({ logger });
  const historial = crearHistorial();

  const app = crearApp(CONFIG.servicio);
  const cerrarConexionesSse = registrarRutas(app, { historial, config: CONFIG });
  manejarErrores(app, logger);

  await registrarSuscripciones(bus, { historial, logger, servicio: CONFIG.servicio });
  const cerrarHttp = await escuchar(app, CONFIG.puerto, logger);

  registrarApagado(logger, [
    // Primero los SSE: mientras sigan abiertos, el servidor HTTP no termina de cerrar
    { nombre: 'conexiones SSE', cerrar: cerrarConexionesSse },
    { nombre: 'servidor HTTP', cerrar: cerrarHttp },
    { nombre: 'bus de eventos', cerrar: bus.close },
  ]);
}

try {
  await arrancar();
} catch (error) {
  abortarArranque(logger, error);
}
