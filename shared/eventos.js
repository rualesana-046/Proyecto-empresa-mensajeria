// Contrato de mensajería: los nombres de evento y los estados que viajan en `data.estado`

export const EVENTOS = Object.freeze({
  ENVIO_CREADO: 'envio.creado',
  ENVIO_ASIGNADO: 'envio.asignado',
  ENVIO_RECOGIDO: 'envio.recogido',
  ENVIO_EN_RUTA: 'envio.en_ruta',
  ENVIO_ENTREGADO: 'envio.entregado',
  ENVIO_NO_ENTREGADO: 'envio.no_entregado',
  COBRO_CONFIRMADO: 'cobro.confirmado',
});

export const ESTADOS_ENVIO = Object.freeze({
  CREADO: 'CREADO',
  ASIGNADO: 'ASIGNADO',
  RECOGIDO: 'RECOGIDO',
  EN_RUTA: 'EN_RUTA',
  ENTREGADO: 'ENTREGADO',
  NO_ENTREGADO: 'NO_ENTREGADO',
});

export const EVENTOS_DE_ENVIO = Object.freeze([
  EVENTOS.ENVIO_CREADO,
  EVENTOS.ENVIO_ASIGNADO,
  EVENTOS.ENVIO_RECOGIDO,
  EVENTOS.ENVIO_EN_RUTA,
  EVENTOS.ENVIO_ENTREGADO,
  EVENTOS.ENVIO_NO_ENTREGADO,
]);

const PREFIJO_STREAM = 'ev:';

export const STREAM_MENSAJES_MUERTOS = `${PREFIJO_STREAM}dead`;

/** Devuelve el nombre del stream de Redis donde vive un tipo de evento. */
export function streamDe(tipo) {
  return `${PREFIJO_STREAM}${tipo}`;
}
