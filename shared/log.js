/** Crea un registrador con prefijo `[servicio]`; acepta el id del envío como contexto opcional. */
export function crearLogger(servicio) {
  const prefijo = `[${servicio}]`;
  const formatear = (mensaje, envioId) =>
    envioId ? `${prefijo} (envio ${envioId}) ${mensaje}` : `${prefijo} ${mensaje}`;
  return Object.freeze({
    info: (mensaje, envioId) => console.log(formatear(mensaje, envioId)),
    error: (mensaje, error, envioId) =>
      console.error(`${formatear(mensaje, envioId)}: ${error?.message ?? error}`),
  });
}
