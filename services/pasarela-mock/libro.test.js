import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RESULTADOS, crearLibro } from './libro.js';

const SIN_FALLOS = Object.freeze({
  tasaFallo: 0,
  tasaRespuestaPerdida: 0,
  perderPrimeraRespuesta: true,
});

describe('pasarela simulada en modo determinista', () => {
  it('la primera llamada de cada llave cobra pero se marca como respuesta perdida', () => {
    const libro = crearLibro({ ...SIN_FALLOS, respetarIdempotencia: true });
    assert.equal(libro.cobrar('llave-1', 100).resultado, RESULTADOS.RESPUESTA_PERDIDA);
    assert.equal(libro.estadisticas().cobrosReales, 1);
  });

  it('con idempotencia, el reintento con la misma llave no vuelve a cobrar', () => {
    const libro = crearLibro({ ...SIN_FALLOS, respetarIdempotencia: true });
    libro.cobrar('llave-1', 100);
    assert.equal(libro.cobrar('llave-1', 100).resultado, RESULTADOS.REPETIDO);
    assert.deepEqual(libro.estadisticas(), { intentos: 2, cobrosReales: 1, repetidosIgnorados: 1 });
  });

  it('sin idempotencia, el reintento cobra dos veces', () => {
    const libro = crearLibro({ ...SIN_FALLOS, respetarIdempotencia: false });
    libro.cobrar('llave-1', 100);
    assert.equal(libro.cobrar('llave-1', 100).resultado, RESULTADOS.COBRADO);
    assert.equal(libro.estadisticas().cobrosReales, 2);
  });
});
