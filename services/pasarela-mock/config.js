import { leerBooleano, leerDecimal, leerEntero } from '../../shared/config.js';

export const CONFIG = Object.freeze({
  servicio: 'pasarela',
  puerto: leerEntero('PUERTO', 3005),
  // Probabilidad de responder 503 sin cobrar
  tasaFallo: leerDecimal('FAIL_RATE', 0.3),
  // Probabilidad de cobrar pero responder tarde: el cliente vence por timeout sin saber que cobró
  tasaRespuestaPerdida: leerDecimal('LOST_REPLY_RATE', 0.2),
  retrasoRespuestaPerdidaMs: leerEntero('LOST_REPLY_DELAY_MS', 3000),
  respetarIdempotencia: leerBooleano('HONOR_IDEMPOTENCY', true),
  // Fuerza que la primera llamada de cada llave cobre y responda tarde: hace reproducible la demo
  perderPrimeraRespuesta: leerBooleano('LOST_FIRST_REPLY', false),
});
