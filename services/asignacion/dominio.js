import { ESTADOS_ENVIO } from '../../shared/eventos.js';

/** Se lanza cuando ningún mensajero de la zona tiene cupo; el evento se reintentará. */
export class SinMensajeroDisponibleError extends Error {
  constructor(zona) {
    super(`No hay mensajero con cupo en la zona ${zona}`);
    this.name = 'SinMensajeroDisponibleError';
  }
}

/** Indica si queda cupo: un mensajero con carga igual a su capacidad ya está lleno. */
export function tieneCupo(mensajero) {
  return mensajero.carga < mensajero.capacidad;
}

/** Devuelve los mensajeros de `zona` con cupo, del menos al más cargado (empate por id). */
export function ordenarCandidatos(mensajeros, zona) {
  return mensajeros
    .filter((mensajero) => mensajero.zona === zona && tieneCupo(mensajero))
    .sort((a, b) => a.carga - b.carga || a.id.localeCompare(b.id));
}

/** Construye el `data` de `envio.asignado` a partir del envío recibido y el mensajero elegido. */
export function datosDeAsignacion(datosEnvio, mensajeroId) {
  return { ...datosEnvio, estado: ESTADOS_ENVIO.ASIGNADO, mensajeroId };
}
