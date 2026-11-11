import { ESTADOS_ENVIO } from '../../shared/eventos.js';
import { HTTP } from '../../shared/http.js';
import { ESTADOS_COBRO } from '../../services/cobros/dominio.js';
import { CONFIG_SCRIPTS as C } from './config.mjs';
import { esperarHasta, pedir } from './http.mjs';

/** Crea un envío por HTTP como lo haría el remitente; lanza si Envíos no responde 201. */
export async function crearEnvio({ zona = 'norte', contraEntrega = true } = {}) {
  const { status, cuerpo } = await pedir('POST', `${C.enviosUrl}/envios`, {
    remitente: 'Remitente de prueba',
    destinatario: 'Destinatario de prueba',
    direccion: 'Calle 10 # 20-30',
    zona,
    contraEntrega,
    valorCobro: contraEntrega ? C.valorCobro : 0,
  });
  if (status !== HTTP.CREADO) throw new Error(`No se pudo crear el envío (HTTP ${status})`);
  return cuerpo.envioId;
}

/** Reporta un nuevo estado del envío como lo haría el mensajero; devuelve el status HTTP. */
export async function reportarEstado(envioId, estado) {
  const { status } = await pedir('POST', `${C.enviosUrl}/envios/${envioId}/estado`, { estado });
  return status;
}

/** Espera a que Envíos refleje la asignación hecha por Asignación. */
export function esperarAsignado(envioId) {
  return esperarHasta(
    async () =>
      (await pedir('GET', `${C.enviosUrl}/envios/${envioId}`)).cuerpo?.estado ===
      ESTADOS_ENVIO.ASIGNADO,
    { timeoutMs: C.esperaAsignacionMs, descripcion: `envío ${envioId} ASIGNADO` },
  );
}

/** Lleva un envío ya asignado hasta `estadoFinal` pasando por RECOGIDO y EN_RUTA. */
export async function llevarHasta(envioId, estadoFinal) {
  for (const estado of [ESTADOS_ENVIO.RECOGIDO, ESTADOS_ENVIO.EN_RUTA, estadoFinal]) {
    const status = await reportarEstado(envioId, estado);
    if (status !== HTTP.OK) throw new Error(`Envío ${envioId}: ${estado} respondió HTTP ${status}`);
  }
}

/** Devuelve el cobro de un envío o `null` si Cobros no tiene ninguno. */
export async function consultarCobro(envioId) {
  const { status, cuerpo } = await pedir('GET', `${C.cobrosUrl}/cobros/${envioId}`);
  return status === HTTP.OK ? cuerpo : null;
}

/** Espera a que el cobro del envío quede CONFIRMADO y lo devuelve. */
export function esperarCobroConfirmado(envioId) {
  return esperarHasta(
    async () => {
      const cobro = await consultarCobro(envioId);
      return cobro?.estado === ESTADOS_COBRO.CONFIRMADO ? cobro : null;
    },
    { timeoutMs: C.esperaCobrosMs, descripcion: `cobro del envío ${envioId} CONFIRMADO` },
  );
}

/** Espera a que no quede ningún cobro PENDIENTE (para medir la pasarela sin ruido de corridas previas). */
export function esperarSinCobrosPendientes() {
  return esperarHasta(
    async () => {
      const { cuerpo } = await pedir('GET', `${C.cobrosUrl}/cobros`);
      return cuerpo.every((cobro) => cobro.estado === ESTADOS_COBRO.CONFIRMADO);
    },
    { timeoutMs: C.esperaCobrosMs, descripcion: 'cobros previos confirmados' },
  );
}

/** Devuelve los contadores acumulados de la pasarela; los scripts comparan antes y después. */
export async function estadisticasPasarela() {
  return (await pedir('GET', `${C.pasarelaUrl}/stats`)).cuerpo;
}
