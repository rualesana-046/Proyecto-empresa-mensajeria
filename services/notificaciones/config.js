import { leerEntero } from '../../shared/config.js';

export const CONFIG = Object.freeze({
  servicio: 'notificaciones',
  puerto: leerEntero('PUERTO', 3004),
  // Comentario SSE periódico para que proxies y navegadores no corten la conexión inactiva
  latidoSseMs: leerEntero('LATIDO_SSE_MS', 15000),
});
