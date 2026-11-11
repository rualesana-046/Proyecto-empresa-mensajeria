/** Pausa sin bloquear el proceso; se usa entre reintentos de conexión y de lectura. */
export function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ejecuta `tarea` en bucle con `intervaloMs` de pausa entre ciclos; devuelve una función que lo detiene. */
export function repetirCada(intervaloMs, tarea) {
  let activo = true;
  let temporizador;
  let cicloEnCurso = Promise.resolve();

  const programar = () => {
    temporizador = setTimeout(() => {
      cicloEnCurso = ejecutarCiclo();
    }, intervaloMs);
  };

  const ejecutarCiclo = async () => {
    await tarea();
    if (activo) programar();
  };

  programar();

  return async function detener() {
    activo = false;
    clearTimeout(temporizador);
    // Espera al ciclo en curso para no cerrar conexiones que todavía se están usando
    await cicloEnCurso;
  };
}
