import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarCandidatos, tieneCupo } from './dominio.js';

const mensajero = (id, zona, carga, capacidad = 20) => ({ id, zona, carga, capacidad });
const ids = (mensajeros, zona) => ordenarCandidatos(mensajeros, zona).map((m) => m.id);

describe('elección de mensajero', () => {
  it('ordena de menor a mayor carga y solo dentro de la zona', () => {
    const mensajeros = [
      mensajero('n1', 'norte', 5),
      mensajero('n2', 'norte', 2),
      mensajero('s1', 'sur', 0),
    ];
    assert.deepEqual(ids(mensajeros, 'norte'), ['n2', 'n1']);
  });

  it('descarta a los mensajeros sin cupo', () => {
    const mensajeros = [mensajero('n1', 'norte', 20), mensajero('n2', 'norte', 19)];
    assert.deepEqual(ids(mensajeros, 'norte'), ['n2']);
  });

  it('no devuelve candidatos si nadie de la zona tiene cupo', () => {
    const mensajeros = [mensajero('n1', 'norte', 20), mensajero('s1', 'sur', 0)];
    assert.deepEqual(ids(mensajeros, 'norte'), []);
  });

  it('desempata por id para que la elección sea determinista', () => {
    const mensajeros = [mensajero('n2', 'norte', 3), mensajero('n1', 'norte', 3)];
    assert.deepEqual(ids(mensajeros, 'norte'), ['n1', 'n2']);
  });

  it('considera lleno a un mensajero con carga igual a su capacidad', () => {
    assert.equal(tieneCupo(mensajero('n1', 'norte', 20, 20)), false);
    assert.equal(tieneCupo(mensajero('n1', 'norte', 19, 20)), true);
  });
});
