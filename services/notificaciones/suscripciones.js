import { EVENTOS, EVENTOS_DE_ENVIO } from '../../shared/eventos.js';

/** Suscribe Notificaciones a todos los eventos de envío y a `cobro.confirmado`. */
export async function registrarSuscripciones(bus, { historial, logger, servicio }) {
  await bus.subscribe({
    service: servicio,
    types: [...EVENTOS_DE_ENVIO, EVENTOS.COBRO_CONFIRMADO],
    handler: async (evento) => {
      const nuevo = historial.registrar(evento);
      logger.info(
        nuevo ? `notificado ${evento.type}` : `${evento.type} repetido ignorado`,
        evento.data.envioId,
      );
    },
  });
}
