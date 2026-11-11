import { EVENTOS } from '../../shared/eventos.js';

/** Suscribe Envíos a `envio.asignado` para reflejar el mensajero elegido por Asignación. */
export async function registrarSuscripciones(bus, { repositorio, logger, servicio }) {
  await bus.subscribe({
    service: servicio,
    types: [EVENTOS.ENVIO_ASIGNADO],
    handler: async ({ data }) => {
      const cambio = await repositorio.marcarAsignado(data.envioId, data.mensajeroId);
      const resultado = cambio ? `asignado a ${data.mensajeroId}` : 'asignación repetida ignorada';
      logger.info(resultado, data.envioId);
    },
  });
}
