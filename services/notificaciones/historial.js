/** Crea el historial en memoria por envío, con detección de eventos repetidos y oyentes en vivo. */
export function crearHistorial() {
  const eventosPorEnvio = new Map();
  const idsVistos = new Set();
  const oyentesPorEnvio = new Map();

  function registrar(evento) {
    // El relay es al-menos-una-vez: un eventId ya visto no se vuelve a notificar
    if (idsVistos.has(evento.eventId)) return false;
    idsVistos.add(evento.eventId);
    const { envioId } = evento.data;
    eventosPorEnvio.set(envioId, [...obtener(envioId), evento]);
    for (const oyente of oyentesPorEnvio.get(envioId) ?? []) oyente(evento);
    return true;
  }

  function obtener(envioId) {
    return eventosPorEnvio.get(envioId) ?? [];
  }

  function escuchar(envioId, oyente) {
    const oyentes = oyentesPorEnvio.get(envioId) ?? new Set();
    oyentes.add(oyente);
    oyentesPorEnvio.set(envioId, oyentes);
    return () => dejarDeEscuchar(envioId, oyente);
  }

  function dejarDeEscuchar(envioId, oyente) {
    const oyentes = oyentesPorEnvio.get(envioId);
    oyentes?.delete(oyente);
    if (oyentes?.size === 0) oyentesPorEnvio.delete(envioId);
  }

  return Object.freeze({ registrar, obtener, escuchar });
}
