import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTTP } from '../../shared/http.js';

const PAGINA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pagina.html');
const CABECERAS_SSE = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
});

/** Registra el SSE, el historial JSON y la página de seguimiento; devuelve cómo cerrar los SSE abiertos. */
export function registrarRutas(app, { historial, config }) {
  const conexionesAbiertas = new Set();

  app.get('/', (_req, res) => res.sendFile(PAGINA));

  app.get('/seguimiento/:id', (req, res) => res.json(historial.obtener(req.params.id)));

  app.get('/seguimiento/:id/stream', (req, res) => {
    res.writeHead(HTTP.OK, CABECERAS_SSE);
    for (const evento of historial.obtener(req.params.id)) enviarEvento(res, evento, true);
    // Sin await entre obtener y escuchar: ningún evento puede colarse entre el historial y el vivo
    const dejarDeEscuchar = historial.escuchar(req.params.id, (evento) =>
      enviarEvento(res, evento, false),
    );
    const latido = setInterval(() => res.write(': latido\n\n'), config.latidoSseMs);
    conexionesAbiertas.add(res);

    req.on('close', () => {
      clearInterval(latido);
      dejarDeEscuchar();
      conexionesAbiertas.delete(res);
    });
  });

  return function cerrarConexionesSse() {
    for (const res of conexionesAbiertas) res.end();
  };
}

function enviarEvento(res, evento, historico) {
  const carga = {
    eventId: evento.eventId,
    type: evento.type,
    ts: evento.ts,
    envioId: evento.data.envioId,
    estado: evento.data.estado,
    data: evento.data,
    historico,
    // Tiempo desde el cambio real (ts lo fija el servicio dueño al escribir el outbox)
    latenciaMs: Date.now() - evento.ts,
  };
  res.write(`id: ${evento.eventId}\ndata: ${JSON.stringify(carga)}\n\n`);
}
