import express from 'express';

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HTTP = Object.freeze({
  OK: 200,
  CREADO: 201,
  SOLICITUD_INVALIDA: 400,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  NO_PROCESABLE: 422,
  ERROR_INTERNO: 500,
  NO_DISPONIBLE: 503,
});

const esErrorDeCliente = (status) =>
  status >= HTTP.SOLICITUD_INVALIDA && status < HTTP.ERROR_INTERNO;

/** Filtra ids mal formados antes de consultar: Postgres lanza error con un UUID inválido. */
export function esUuid(valor) {
  return typeof valor === 'string' && PATRON_UUID.test(valor);
}

/** Crea una app Express con JSON y `GET /health` para el servicio indicado. */
export function crearApp(servicio) {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ servicio, estado: 'ok' }));
  return app;
}

/** Registra el manejador final de errores: 4xx se devuelven al cliente, el resto se registra como 500. */
export function manejarErrores(app, logger) {
  app.use((error, req, res, _next) => {
    // Express marca con status 400 el JSON mal formado del cuerpo
    if (esErrorDeCliente(error.status))
      return res.status(error.status).json({ error: error.message });
    logger.error(`Error atendiendo ${req.method} ${req.originalUrl}`, error);
    return res.status(HTTP.ERROR_INTERNO).json({ error: 'Error interno' });
  });
}

/** Inicia el servidor HTTP en `puerto` y devuelve una función que lo cierra. */
export async function escuchar(app, puerto, logger) {
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(puerto, () => resolve(instancia));
  });
  logger.info(`Escuchando en el puerto ${puerto}`);
  return () => cerrarServidor(servidor);
}

function cerrarServidor(servidor) {
  return new Promise((resolve, reject) => {
    servidor.close((error) => (error ? reject(error) : resolve()));
    servidor.closeIdleConnections();
  });
}
