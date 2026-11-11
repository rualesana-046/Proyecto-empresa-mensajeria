import { registrarApagado } from '../../shared/apagado.js';
import { crearApp, escuchar, manejarErrores } from '../../shared/http.js';
import { crearLogger } from '../../shared/log.js';
import { CONFIG } from './config.js';
import { crearLibro } from './libro.js';
import { registrarRutas } from './rutas.js';

const logger = crearLogger(CONFIG.servicio);
const libro = crearLibro(CONFIG);
const app = crearApp(CONFIG.servicio);

registrarRutas(app, { libro, config: CONFIG, logger });
manejarErrores(app, logger);

const cerrarHttp = await escuchar(app, CONFIG.puerto, logger);
logger.info(
  `FAIL_RATE=${CONFIG.tasaFallo} LOST_REPLY_RATE=${CONFIG.tasaRespuestaPerdida} HONOR_IDEMPOTENCY=${CONFIG.respetarIdempotencia} LOST_FIRST_REPLY=${CONFIG.perderPrimeraRespuesta}`,
);
registrarApagado(logger, [{ nombre: 'servidor HTTP', cerrar: cerrarHttp }]);
