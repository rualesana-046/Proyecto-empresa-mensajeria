const SEPARADOR_DE_EVENTO = '\n\n';
const PREFIJO_DATOS = 'data: ';
const ERROR_DE_ABORTO = 'AbortError';

/** Abre un stream SSE con fetch (como un cliente real) y permite esperar eventos concretos. */
export async function abrirSse(url) {
  const controlador = new AbortController();
  const respuesta = await fetch(url, { signal: controlador.signal });
  const recibidos = [];
  const esperas = new Set();

  const alRecibir = (evento) => {
    recibidos.push(evento);
    for (const espera of esperas) espera.revisar();
  };
  const lectura = leerHastaCerrar(respuesta.body, alRecibir);

  function esperarEvento(predicado, timeoutMs) {
    return new Promise((resolve, reject) => {
      const espera = {
        revisar: () => {
          const evento = recibidos.find(predicado);
          if (!evento) return;
          clearTimeout(temporizador);
          esperas.delete(espera);
          resolve(evento);
        },
      };
      const temporizador = setTimeout(() => {
        esperas.delete(espera);
        reject(new Error(`No llegó por SSE el evento esperado en ${timeoutMs} ms`));
      }, timeoutMs);
      esperas.add(espera);
      espera.revisar();
    });
  }

  async function cerrar() {
    controlador.abort();
    await lectura;
  }

  return { esperarEvento, cerrar };
}

async function leerHastaCerrar(cuerpo, alRecibir) {
  try {
    await leerEventos(cuerpo, alRecibir);
  } catch (error) {
    // Cerrar el SSE aborta la lectura a propósito; cualquier otro corte se informa
    if (error.name !== ERROR_DE_ABORTO)
      console.error(`  ! lectura SSE interrumpida: ${error.message}`);
  }
}

async function leerEventos(cuerpo, alRecibir) {
  const decodificador = new TextDecoder();
  let pendiente = '';
  for await (const trozo of cuerpo) {
    pendiente += decodificador.decode(trozo, { stream: true });
    const bloques = pendiente.split(SEPARADOR_DE_EVENTO);
    pendiente = bloques.pop();
    for (const bloque of bloques) {
      const linea = bloque.split('\n').find((l) => l.startsWith(PREFIJO_DATOS));
      // La hora de llegada se toma aquí, en el cliente, para medir la latencia real percibida
      if (linea)
        alRecibir({ ...JSON.parse(linea.slice(PREFIJO_DATOS.length)), recibidoEn: Date.now() });
    }
  }
}
