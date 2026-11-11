import { CONFIG_INFRA } from './config.js';

const SENALES = ['SIGTERM', 'SIGINT'];
const SALIDA_CORRECTA = 0;
const SALIDA_CON_ERROR = 1;

/** Ejecuta los `pasos` de cierre en orden al recibir SIGTERM o SIGINT y termina el proceso. */
export function registrarApagado(logger, pasos) {
  let apagando = false;

  const apagar = async (senal) => {
    if (apagando) return;
    apagando = true;
    logger.info(`Recibida ${senal}: apagado ordenado`);
    programarSalidaForzada(logger);
    for (const { nombre, cerrar } of pasos) await cerrarPaso(logger, nombre, cerrar);
    process.exit(SALIDA_CORRECTA);
  };

  for (const senal of SENALES) process.on(senal, () => apagar(senal));
}

async function cerrarPaso(logger, nombre, cerrar) {
  try {
    await cerrar();
    logger.info(`Cerrado: ${nombre}`);
  } catch (error) {
    logger.error(`Falló el cierre de ${nombre}`, error);
  }
}

function programarSalidaForzada(logger) {
  const temporizador = setTimeout(() => {
    logger.error('El apagado superó el tiempo máximo', 'salida forzada');
    process.exit(SALIDA_CON_ERROR);
  }, CONFIG_INFRA.tiempoMaximoApagadoMs);
  // unref: este temporizador no debe mantener vivo el proceso por sí solo
  temporizador.unref();
}

/** Sale con código 1 para que Docker reinicie el contenedor (`restart: unless-stopped`). */
export function abortarArranque(logger, error) {
  logger.error('No se pudo arrancar el servicio', error);
  process.exit(SALIDA_CON_ERROR);
}
