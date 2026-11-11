import { HTTP, esUuid } from '../../shared/http.js';
import { ERRORES, esEstadoReportable, prepararNuevoEnvio, validarNuevoEnvio } from './dominio.js';

const STATUS_POR_ERROR = Object.freeze({
  [ERRORES.CAMPOS_FALTANTES]: HTTP.SOLICITUD_INVALIDA,
  [ERRORES.ESTADO_NO_REPORTABLE]: HTTP.SOLICITUD_INVALIDA,
  [ERRORES.COBRO_INVALIDO]: HTTP.NO_PROCESABLE,
  [ERRORES.NO_ENCONTRADO]: HTTP.NO_ENCONTRADO,
  [ERRORES.TRANSICION_INVALIDA]: HTTP.CONFLICTO,
});

/** Registra la entrada HTTP: el remitente crea envíos y el mensajero reporta estados. */
export function registrarRutas(app, { repositorio }) {
  app.post('/envios', async (req, res) => {
    const invalido = validarNuevoEnvio(req.body);
    if (invalido) return responderError(res, invalido);
    const envio = await repositorio.crearEnvio(prepararNuevoEnvio(req.body));
    return res.status(HTTP.CREADO).json(envio);
  });

  app.post('/envios/:id/estado', async (req, res) => {
    if (!esUuid(req.params.id)) return responderError(res, { error: ERRORES.NO_ENCONTRADO });
    const estado = req.body?.estado;
    if (!esEstadoReportable(estado)) {
      return responderError(res, { error: ERRORES.ESTADO_NO_REPORTABLE, detalle: estado });
    }
    const { error, envio } = await repositorio.cambiarEstado(req.params.id, estado);
    if (error)
      return responderError(res, { error, detalle: envio && `Estado actual: ${envio.estado}` });
    return res.json(envio);
  });

  app.get('/envios/:id', async (req, res) => {
    const envio = esUuid(req.params.id) ? await repositorio.buscarPorId(req.params.id) : null;
    if (!envio) return responderError(res, { error: ERRORES.NO_ENCONTRADO });
    return res.json(envio);
  });
}

function responderError(res, { error, detalle }) {
  return res.status(STATUS_POR_ERROR[error]).json({ error, detalle });
}
