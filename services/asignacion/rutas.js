/** Registra `GET /mensajeros` para inspeccionar la carga de cada mensajero. */
export function registrarRutas(app, { repositorio }) {
  app.get('/mensajeros', async (_req, res) => res.json(await repositorio.listarMensajeros()));
}
