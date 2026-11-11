/** Lee un entero del entorno; así todo valor ajustable vive en un `config.js` y no en el código. */
export function leerEntero(nombre, porDefecto) {
  const valor = process.env[nombre];
  return valor === undefined ? porDefecto : Number.parseInt(valor, 10);
}

/** Lee una tasa o proporción del entorno (p. ej. FAIL_RATE=0.3) con su valor por defecto. */
export function leerDecimal(nombre, porDefecto) {
  const valor = process.env[nombre];
  return valor === undefined ? porDefecto : Number.parseFloat(valor);
}

/** Solo el texto "true" (sin importar mayúsculas) cuenta como verdadero; cualquier otro, falso. */
export function leerBooleano(nombre, porDefecto) {
  const valor = process.env[nombre];
  return valor === undefined ? porDefecto : valor.toLowerCase() === 'true';
}

/** Lee URLs y nombres de base del entorno; en Docker los fija docker-compose.yml. */
export function leerTexto(nombre, porDefecto) {
  return process.env[nombre] ?? porDefecto;
}

export const CONFIG_INFRA = Object.freeze({
  redisUrl: leerTexto('REDIS_URL', 'redis://localhost:6379'),
  bus: Object.freeze({
    bloqueoLecturaMs: leerEntero('BUS_BLOQUEO_LECTURA_MS', 2000),
    loteLectura: leerEntero('BUS_LOTE_LECTURA', 20),
    intervaloRecuperacionMs: leerEntero('BUS_INTERVALO_RECUPERACION_MS', 1000),
    inactividadMinimaMs: leerEntero('BUS_INACTIVIDAD_MINIMA_MS', 3000),
    maxEntregas: leerEntero('BUS_MAX_ENTREGAS', 5),
  }),
  outbox: Object.freeze({
    intervaloRelayMs: leerEntero('OUTBOX_INTERVALO_MS', 100),
    loteRelay: leerEntero('OUTBOX_LOTE', 50),
  }),
  db: Object.freeze({
    maxIntentosConexion: leerEntero('DB_MAX_INTENTOS', 30),
    esperaEntreIntentosMs: leerEntero('DB_ESPERA_INTENTO_MS', 1000),
  }),
  tiempoMaximoApagadoMs: leerEntero('APAGADO_MAXIMO_MS', 5000),
});
