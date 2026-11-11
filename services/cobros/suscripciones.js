import { EVENTOS } from '../../shared/eventos.js';
import { requiereCobro } from './dominio.js';

/** Suscribe Cobros a `envio.entregado`; solo registra la intención de cobro, nunca cobra aquí. */
export async function registrarSuscripciones(bus, { repositorio, logger, servicio }) {
  // No hay suscripción a envio.no_entregado: un envío no entregado nunca puede generar cobro
  await bus.subscribe({
    service: servicio,
    types: [EVENTOS.ENVIO_ENTREGADO],
    handler: async ({ data }) => {
      if (!requiereCobro(data)) return;
      const registrado = await repositorio.registrarIntencion(data.envioId, data.valorCobro);
      logger.info(
        registrado ? 'intención de cobro registrada' : 'intención repetida ignorada',
        data.envioId,
      );
    },
  });
}
