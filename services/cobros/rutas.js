import { HTTP, esUuid } from '../../shared/http.js';

/** Registra rutas solo de lectura: un cobro nace del evento envio.entregado, nunca por HTTP. */
export function registrarRutas(app, { repositorio }) {
  app.get('/cobros', async (_req, res) => res.json(await repositorio.listar()));

  app.get('/cobros/:envioId', async (req, res) => {
    const cobro = esUuid(req.params.envioId)
      ? await repositorio.buscarPorEnvio(req.params.envioId)
      : null;
    if (!cobro)
      return res.status(HTTP.NO_ENCONTRADO).json({ error: 'No hay cobro para este envío' });
    return res.json(cobro);
  });
}
