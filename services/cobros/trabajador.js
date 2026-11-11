import { repetirCada } from '../../shared/tiempo.js';
import { calcularAlquilerMs } from './dominio.js';

/** Arranca el bucle que reclama cobros pendientes y los intenta en la pasarela; devuelve cómo detenerlo. */
export function iniciarTrabajadorDeCobro({ repositorio, pasarela, config, logger }) {
  const parametrosAlquiler = { ...config.retroceso, timeoutMs: config.timeoutPasarelaMs };
  const alquilerMsPara = (intento) => calcularAlquilerMs(intento, parametrosAlquiler);

  const procesarLote = async () => {
    try {
      const cobros = await repositorio.reclamarCobrosPendientes(config.loteCobros, alquilerMsPara);
      await Promise.all(
        cobros.map((cobro) => intentarCobro(cobro, { repositorio, pasarela, logger })),
      );
    } catch (error) {
      logger.error('No se pudieron reclamar cobros pendientes', error);
    }
  };

  return repetirCada(config.intervaloTrabajadorMs, procesarLote);
}

async function intentarCobro(cobro, { repositorio, pasarela, logger }) {
  try {
    // La llave es el id del cobro: estable entre reintentos y entre reinicios del proceso
    const referencia = await pasarela.cobrar({
      llave: cobro.cobroId,
      monto: cobro.monto,
      envioId: cobro.envioId,
    });
    const confirmado = await repositorio.confirmarCobro(cobro.cobroId, referencia);
    logger.info(
      confirmado ? `cobro confirmado (intento ${cobro.intentos})` : 'cobro ya estaba confirmado',
      cobro.envioId,
    );
  } catch (error) {
    logger.error(
      `Intento ${cobro.intentos} de cobro fallido; se reintentará`,
      error,
      cobro.envioId,
    );
    await registrarFalloSinInterrumpir(repositorio, cobro, error, logger);
  }
}

async function registrarFalloSinInterrumpir(repositorio, cobro, error, logger) {
  try {
    await repositorio.registrarFallo(cobro.cobroId, error.message);
  } catch (errorAlRegistrar) {
    logger.error('No se pudo guardar el último error del cobro', errorAlRegistrar, cobro.envioId);
  }
}
