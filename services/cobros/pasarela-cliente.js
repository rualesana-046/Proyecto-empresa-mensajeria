const CABECERA_IDEMPOTENCIA = 'Idempotency-Key';
const ERROR_DE_TIMEOUT = 'TimeoutError';

/** Error de un intento de cobro fallido (503, timeout o red); el cobro sigue pendiente. */
export class ErrorPasarela extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorPasarela';
  }
}

/** Crea el cliente HTTP de la pasarela externa con timeout por llamada. */
export function crearClientePasarela({ url, timeoutMs }) {
  async function cobrar({ llave, monto, envioId }) {
    const respuesta = await enviarSolicitud({ llave, monto, envioId });
    if (!respuesta.ok) throw new ErrorPasarela(`La pasarela respondió ${respuesta.status}`);
    const { referencia } = await respuesta.json();
    return referencia;
  }

  async function enviarSolicitud({ llave, monto, envioId }) {
    try {
      return await fetch(`${url}/cobros`, {
        method: 'POST',
        // Misma llave en cada reintento: la pasarela reconoce el cobro repetido
        headers: { 'Content-Type': 'application/json', [CABECERA_IDEMPOTENCIA]: llave },
        body: JSON.stringify({ monto, envioId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const motivo =
        error.name === ERROR_DE_TIMEOUT ? `sin respuesta en ${timeoutMs} ms` : error.message;
      throw new ErrorPasarela(`Llamada a la pasarela falló: ${motivo}`);
    }
  }

  return Object.freeze({ cobrar });
}
