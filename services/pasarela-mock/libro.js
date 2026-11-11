import { randomUUID } from 'node:crypto';

export const RESULTADOS = Object.freeze({
  FALLO: 'FALLO',
  RESPUESTA_PERDIDA: 'RESPUESTA_PERDIDA',
  COBRADO: 'COBRADO',
  REPETIDO: 'REPETIDO',
});

/** Crea el libro simulado de la pasarela: guarda llave → cobro y cuenta intentos. */
export function crearLibro({
  tasaFallo,
  tasaRespuestaPerdida,
  respetarIdempotencia,
  perderPrimeraRespuesta = false,
  azar = Math.random,
}) {
  const cobrosPorLlave = new Map();
  const llavesVistas = new Set();
  const estadisticas = { intentos: 0, cobrosReales: 0, repetidosIgnorados: 0 };

  function registrarCobro(llave, monto) {
    estadisticas.cobrosReales += 1;
    const cobro = { referencia: randomUUID(), llave, monto };
    if (respetarIdempotencia) cobrosPorLlave.set(llave, cobro);
    return cobro;
  }

  function decidirResultado(llave) {
    const esPrimeraVez = !llavesVistas.has(llave);
    llavesVistas.add(llave);
    // Modo determinista: cada llave nueva cobra y responde tarde, así el reintento siempre llega
    if (perderPrimeraRespuesta && esPrimeraVez) return RESULTADOS.RESPUESTA_PERDIDA;
    const tirada = azar();
    if (tirada < tasaFallo) return RESULTADOS.FALLO;
    if (tirada < tasaFallo + tasaRespuestaPerdida) return RESULTADOS.RESPUESTA_PERDIDA;
    return RESULTADOS.COBRADO;
  }

  function cobrar(llave, monto) {
    estadisticas.intentos += 1;
    // Una llave ya vista devuelve el cobro original sin volver a mover dinero
    if (respetarIdempotencia && cobrosPorLlave.has(llave)) {
      estadisticas.repetidosIgnorados += 1;
      return { resultado: RESULTADOS.REPETIDO, cobro: cobrosPorLlave.get(llave) };
    }
    const resultado = decidirResultado(llave);
    if (resultado === RESULTADOS.FALLO) return { resultado };
    return { resultado, cobro: registrarCobro(llave, monto) };
  }

  return Object.freeze({ cobrar, estadisticas: () => ({ ...estadisticas }) });
}
