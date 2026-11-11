import { CONFIG_SCRIPTS } from './config.mjs';

/** Hace una petición JSON y devuelve `{ status, cuerpo }` sin lanzar por códigos 4xx/5xx. */
export async function pedir(metodo, url, cuerpo) {
  const respuesta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

/** Sondea `consulta` hasta que devuelva algo verdadero; lanza si pasa `timeoutMs`. */
export async function esperarHasta(consulta, { timeoutMs, descripcion }) {
  const limite = Date.now() + timeoutMs;
  let ultimoError;
  while (Date.now() < limite) {
    try {
      const resultado = await consulta();
      if (resultado) return resultado;
    } catch (error) {
      // Un servicio que está reiniciando rechaza conexiones: se sigue sondeando hasta el límite
      ultimoError = error;
    }
    await dormir(CONFIG_SCRIPTS.intervaloSondeoMs);
  }
  const detalle = ultimoError ? ` (último error: ${ultimoError.message})` : '';
  throw new Error(`Tiempo agotado (${timeoutMs} ms) esperando: ${descripcion}${detalle}`);
}

/** Pausa entre sondeos; no bloquea las lecturas SSE abiertas en el mismo script. */
export function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
