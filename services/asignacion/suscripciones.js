import { EVENTOS } from '../../shared/eventos.js';

/** Suscribe Asignación a la creación de envíos (asignar) y a su cierre (liberar cupo). */
export async function registrarSuscripciones(bus, { repositorio, logger, servicio }) {
  const manejadores = {
    [EVENTOS.ENVIO_CREADO]: (data) => asignar(repositorio, logger, data),
    [EVENTOS.ENVIO_ENTREGADO]: (data) => liberar(repositorio, logger, data),
    [EVENTOS.ENVIO_NO_ENTREGADO]: (data) => liberar(repositorio, logger, data),
  };
  await bus.subscribe({
    service: servicio,
    types: Object.keys(manejadores),
    handler: ({ type, data }) => manejadores[type](data),
  });
}

async function asignar(repositorio, logger, data) {
  const { duplicado, mensajeroId } = await repositorio.asignarEnvio(data);
  logger.info(
    duplicado ? 'envio.creado repetido ignorado' : `asignado a ${mensajeroId}`,
    data.envioId,
  );
}

async function liberar(repositorio, logger, data) {
  const liberado = await repositorio.liberarCupo(data.envioId);
  logger.info(
    liberado ? `cupo liberado de ${data.mensajeroId}` : 'liberación repetida ignorada',
    data.envioId,
  );
}
