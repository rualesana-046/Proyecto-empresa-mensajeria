import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAlquilerMs, calcularRetrocesoMs, requiereCobro } from './dominio.js';

const RETROCESO = Object.freeze({ baseMs: 1000, maxMs: 30000 });

describe('retroceso exponencial', () => {
  it('duplica la espera en cada intento: 1 s, 2 s, 4 s, 8 s', () => {
    const esperas = [1, 2, 3, 4].map((intento) => calcularRetrocesoMs(intento, RETROCESO));
    assert.deepEqual(esperas, [1000, 2000, 4000, 8000]);
  });

  it('no pasa del máximo de 30 s', () => {
    assert.equal(calcularRetrocesoMs(6, RETROCESO), 30000);
    assert.equal(calcularRetrocesoMs(50, RETROCESO), 30000);
  });

  it('trata un intento 0 o negativo como el primero', () => {
    assert.equal(calcularRetrocesoMs(0, RETROCESO), 1000);
  });

  it('el alquiler cubre el timeout de la llamada más el retroceso', () => {
    assert.equal(calcularAlquilerMs(1, { ...RETROCESO, timeoutMs: 2000 }), 3000);
    assert.equal(calcularAlquilerMs(3, { ...RETROCESO, timeoutMs: 2000 }), 6000);
  });
});

describe('decisión de cobrar', () => {
  it('solo cobra envíos contra entrega con valor positivo', () => {
    assert.equal(requiereCobro({ contraEntrega: true, valorCobro: 1000 }), true);
    assert.equal(requiereCobro({ contraEntrega: false, valorCobro: 1000 }), false);
    assert.equal(requiereCobro({ contraEntrega: true, valorCobro: 0 }), false);
  });
});
