import { ESTADOS_ENVIO as ESTADOS, EVENTOS } from '../../shared/eventos.js';

const TRANSICIONES = Object.freeze({
  [ESTADOS.CREADO]: [ESTADOS.ASIGNADO],
  [ESTADOS.ASIGNADO]: [ESTADOS.RECOGIDO],
  [ESTADOS.RECOGIDO]: [ESTADOS.EN_RUTA],
  [ESTADOS.EN_RUTA]: [ESTADOS.ENTREGADO, ESTADOS.NO_ENTREGADO],
  [ESTADOS.ENTREGADO]: [],
  [ESTADOS.NO_ENTREGADO]: [],
});

// ASIGNADO no está aquí: solo lo fija el sistema al consumir envio.asignado
const ESTADOS_REPORTABLES = Object.freeze([
  ESTADOS.RECOGIDO,
  ESTADOS.EN_RUTA,
  ESTADOS.ENTREGADO,
  ESTADOS.NO_ENTREGADO,
]);

const EVENTO_POR_ESTADO = Object.freeze({
  [ESTADOS.CREADO]: EVENTOS.ENVIO_CREADO,
  [ESTADOS.ASIGNADO]: EVENTOS.ENVIO_ASIGNADO,
  [ESTADOS.RECOGIDO]: EVENTOS.ENVIO_RECOGIDO,
  [ESTADOS.EN_RUTA]: EVENTOS.ENVIO_EN_RUTA,
  [ESTADOS.ENTREGADO]: EVENTOS.ENVIO_ENTREGADO,
  [ESTADOS.NO_ENTREGADO]: EVENTOS.ENVIO_NO_ENTREGADO,
});

const CAMPOS_DE_TEXTO = Object.freeze(['remitente', 'destinatario', 'direccion', 'zona']);

export const ERRORES = Object.freeze({
  CAMPOS_FALTANTES: 'CAMPOS_FALTANTES',
  COBRO_INVALIDO: 'COBRO_INVALIDO',
  ESTADO_NO_REPORTABLE: 'ESTADO_NO_REPORTABLE',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  TRANSICION_INVALIDA: 'TRANSICION_INVALIDA',
});

/** Indica si la máquina de estados permite pasar de `desde` a `hacia`. */
export function esTransicionValida(desde, hacia) {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

/** Indica si el mensajero puede reportar `estado` (todos menos CREADO y ASIGNADO). */
export function esEstadoReportable(estado) {
  return ESTADOS_REPORTABLES.includes(estado);
}

/** Devuelve el nombre del evento que se publica al entrar en `estado`. */
export function eventoDeEstado(estado) {
  return EVENTO_POR_ESTADO[estado];
}

/** Valida una solicitud de envío; devuelve `null` si es válida o `{ error, detalle }` si no. */
export function validarNuevoEnvio(solicitud = {}) {
  const faltantes = CAMPOS_DE_TEXTO.filter((campo) => !esTextoConContenido(solicitud[campo]));
  if (typeof solicitud.contraEntrega !== 'boolean') faltantes.push('contraEntrega');
  if (faltantes.length > 0) return { error: ERRORES.CAMPOS_FALTANTES, detalle: faltantes };

  const valor = solicitud.valorCobro ?? 0;
  if (typeof valor !== 'number' || valor < 0) {
    return { error: ERRORES.COBRO_INVALIDO, detalle: 'valorCobro debe ser un número >= 0' };
  }
  if (solicitud.contraEntrega && valor <= 0) {
    return {
      error: ERRORES.COBRO_INVALIDO,
      detalle: 'Un envío contra entrega exige valorCobro > 0',
    };
  }
  return null;
}

/** Devuelve el envío nuevo ya limpio, en estado CREADO y sin valor de cobro si no es contra entrega. */
export function prepararNuevoEnvio(solicitud) {
  return {
    remitente: solicitud.remitente.trim(),
    destinatario: solicitud.destinatario.trim(),
    direccion: solicitud.direccion.trim(),
    zona: solicitud.zona.trim(),
    contraEntrega: solicitud.contraEntrega,
    valorCobro: solicitud.contraEntrega ? solicitud.valorCobro : 0,
    estado: ESTADOS.CREADO,
  };
}

/** Extrae del envío los campos que viajan en `data` de los eventos de envío. */
export function datosDeEvento(envio) {
  const { envioId, estado, zona, direccion, contraEntrega, valorCobro, mensajeroId } = envio;
  return { envioId, estado, zona, direccion, contraEntrega, valorCobro, mensajeroId };
}

function esTextoConContenido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}
