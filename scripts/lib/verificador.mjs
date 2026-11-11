const CODIGO_FALLO = 1;

/** Crea un registro de verificaciones que imprime ✔/✘ y fija el código de salida si algo falla. */
export function crearVerificador() {
  let fallos = 0;

  function verificar(condicion, descripcion) {
    if (!condicion) fallos += 1;
    console.log(`  ${condicion ? '✔' : '✘'} ${descripcion}`);
    return condicion;
  }

  async function ejecutar(principal) {
    try {
      await principal();
    } catch (error) {
      // Un script interrumpido cuenta como fallo aunque las verificaciones previas pasaran
      verificar(false, `El script se detuvo: ${error.message}`);
    }
    terminar();
  }

  function terminar() {
    const resumen =
      fallos === 0 ? 'Todas las verificaciones pasaron.' : `${fallos} verificación(es) fallaron.`;
    console.log(`\n${resumen}`);
    if (fallos > 0) process.exitCode = CODIGO_FALLO;
  }

  return { verificar, ejecutar };
}
