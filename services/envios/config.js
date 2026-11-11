import { leerEntero, leerTexto } from '../../shared/config.js';

export const CONFIG = Object.freeze({
  servicio: 'envios',
  puerto: leerEntero('PUERTO', 3001),
  baseDeDatos: leerTexto('DB_NOMBRE', 'envios_db'),
});
