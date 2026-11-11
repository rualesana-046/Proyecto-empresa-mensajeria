import { HTTP } from '../../shared/http.js';
import { esperar } from '../../shared/tiempo.js';
import { RESULTADOS } from './libro.js';

const CABECERA_IDEMPOTENCIA = 'Idempotency-Key';

/** Registra `POST /cobros` y `GET /stats` de la pasarela simulada. */
export function registrarRutas(app, { libro, config, logger }) {
  app.post('/cobros', async (req, res) => {
    const llave = req.get(CABECERA_IDEMPOTENCIA);
    const monto = Number(req.body?.monto);
    if (!llave)
      return res
        .status(HTTP.SOLICITUD_INVALIDA)
        .json({ error: `Falta la cabecera ${CABECERA_IDEMPOTENCIA}` });
    if (!(monto > 0))
      return res.status(HTTP.NO_PROCESABLE).json({ error: 'El monto debe ser mayor que cero' });

    const { resultado, cobro } = libro.cobrar(llave, monto);
    logger.info(`Llave ${llave}: ${resultado}`, req.body?.envioId);
    if (resultado === RESULTADOS.FALLO)
      return res.status(HTTP.NO_DISPONIBLE).json({ error: 'Pasarela no disponible' });
    // El dinero ya se movió; la respuesta llega cuando el cliente ya dejó de esperar
    if (resultado === RESULTADOS.RESPUESTA_PERDIDA) await esperar(config.retrasoRespuestaPerdidaMs);
    return res.status(HTTP.OK).json({ referencia: cobro.referencia, monto: cobro.monto });
  });

  app.get('/stats', (_req, res) => res.json(libro.estadisticas()));
}
