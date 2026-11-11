import { leerEntero, leerTexto } from '../../shared/config.js';

export const CONFIG = Object.freeze({
  servicio: 'cobros',
  puerto: leerEntero('PUERTO', 3003),
  baseDeDatos: leerTexto('DB_NOMBRE', 'cobros_db'),
  pasarelaUrl: leerTexto('PASARELA_URL', 'http://localhost:3005'),
  timeoutPasarelaMs: leerEntero('TIMEOUT_PASARELA_MS', 2000),
  intervaloTrabajadorMs: leerEntero('INTERVALO_TRABAJADOR_MS', 500),
  loteCobros: leerEntero('LOTE_COBROS', 10),
  retroceso: Object.freeze({
    baseMs: leerEntero('RETROCESO_BASE_MS', 1000),
    maxMs: leerEntero('RETROCESO_MAX_MS', 30000),
  }),
});
