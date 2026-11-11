const entero = (nombre, porDefecto) => Number.parseInt(process.env[nombre] ?? porDefecto, 10);

export const CONFIG_SCRIPTS = Object.freeze({
  enviosUrl: process.env.ENVIOS_URL ?? 'http://localhost:3001',
  cobrosUrl: process.env.COBROS_URL ?? 'http://localhost:3003',
  notificacionesUrl: process.env.NOTIFICACIONES_URL ?? 'http://localhost:3004',
  pasarelaUrl: process.env.PASARELA_URL ?? 'http://localhost:3005',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  rafaga: entero('BURST', 20),
  enviosEscala: entero('ENVIOS_ESCALA', 30),
  // D1: el estado debe llegar al cliente en menos de 3 s
  latenciaMaximaMs: entero('LATENCIA_MAXIMA_MS', 3000),
  esperaAsignacionMs: entero('ESPERA_ASIGNACION_MS', 15000),
  esperaCobrosMs: entero('ESPERA_COBROS_MS', 120000),
  esperaSinCobroMs: entero('ESPERA_SIN_COBRO_MS', 5000),
  intervaloSondeoMs: entero('INTERVALO_SONDEO_MS', 250),
  valorCobro: entero('VALOR_COBRO', 50000),
});
