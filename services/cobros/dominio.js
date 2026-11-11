export const ESTADOS_COBRO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  CONFIRMADO: 'CONFIRMADO',
});

/** Indica si el envío entregado genera cobro: solo los contra entrega con valor positivo. */
export function requiereCobro(datosEnvio) {
  return datosEnvio.contraEntrega === true && datosEnvio.valorCobro > 0;
}

/** Devuelve la espera del intento número `intento` (1, 2, 4… s) sin pasar de `maxMs`. */
export function calcularRetrocesoMs(intento, { baseMs, maxMs }) {
  const exponente = Math.max(intento, 1) - 1;
  return Math.min(baseMs * 2 ** exponente, maxMs);
}

/**
 * Devuelve cuánto dura el alquiler de un cobro reclamado: el timeout de la llamada más el retroceso.
 * Así el alquiler nunca vence mientras la llamada a la pasarela sigue en curso.
 */
export function calcularAlquilerMs(intento, { baseMs, maxMs, timeoutMs }) {
  return timeoutMs + calcularRetrocesoMs(intento, { baseMs, maxMs });
}

/** Construye el `data` del evento `cobro.confirmado`. */
export function datosDeCobroConfirmado(cobro) {
  const { cobroId, envioId, monto, referencia, estado } = cobro;
  return { cobroId, envioId, monto, referencia, estado };
}
