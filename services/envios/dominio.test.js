import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_ENVIO as ESTADOS, EVENTOS } from '../../shared/eventos.js';
import {
  ERRORES,
  esEstadoReportable,
  esTransicionValida,
  eventoDeEstado,
  prepararNuevoEnvio,
  validarNuevoEnvio,
} from './dominio.js';

const SOLICITUD_VALIDA = Object.freeze({
  remitente: 'Ana',
  destinatario: 'Luis',
  direccion: 'Calle 1 # 2-3',
  zona: 'norte',
  contraEntrega: true,
  valorCobro: 50000,
});

describe('máquina de estados del envío', () => {
  const caminoFeliz = [
    [ESTADOS.CREADO, ESTADOS.ASIGNADO],
    [ESTADOS.ASIGNADO, ESTADOS.RECOGIDO],
    [ESTADOS.RECOGIDO, ESTADOS.EN_RUTA],
    [ESTADOS.EN_RUTA, ESTADOS.ENTREGADO],
    [ESTADOS.EN_RUTA, ESTADOS.NO_ENTREGADO],
  ];
  for (const [desde, hacia] of caminoFeliz) {
    it(`permite ${desde} → ${hacia}`, () => assert.equal(esTransicionValida(desde, hacia), true));
  }

  const invalidas = [
    [ESTADOS.CREADO, ESTADOS.RECOGIDO],
    [ESTADOS.ASIGNADO, ESTADOS.ENTREGADO],
    [ESTADOS.RECOGIDO, ESTADOS.RECOGIDO],
    [ESTADOS.ENTREGADO, ESTADOS.EN_RUTA],
    [ESTADOS.NO_ENTREGADO, ESTADOS.ENTREGADO],
    ['INEXISTENTE', ESTADOS.ASIGNADO],
  ];
  for (const [desde, hacia] of invalidas) {
    it(`rechaza ${desde} → ${hacia}`, () => assert.equal(esTransicionValida(desde, hacia), false));
  }

  it('no deja que el mensajero reporte CREADO ni ASIGNADO', () => {
    assert.equal(esEstadoReportable(ESTADOS.CREADO), false);
    assert.equal(esEstadoReportable(ESTADOS.ASIGNADO), false);
    assert.equal(esEstadoReportable(ESTADOS.EN_RUTA), true);
  });

  it('asocia cada estado con su evento', () => {
    assert.equal(eventoDeEstado(ESTADOS.ENTREGADO), EVENTOS.ENVIO_ENTREGADO);
    assert.equal(eventoDeEstado(ESTADOS.NO_ENTREGADO), EVENTOS.ENVIO_NO_ENTREGADO);
  });
});

describe('validación de un envío nuevo', () => {
  it('acepta una solicitud completa', () =>
    assert.equal(validarNuevoEnvio(SOLICITUD_VALIDA), null));

  it('lista los campos obligatorios que faltan', () => {
    const { error, detalle } = validarNuevoEnvio({ remitente: 'Ana', zona: '  ' });
    assert.equal(error, ERRORES.CAMPOS_FALTANTES);
    assert.deepEqual(detalle, ['destinatario', 'direccion', 'zona', 'contraEntrega']);
  });

  it('exige valorCobro > 0 en un envío contra entrega', () => {
    const resultado = validarNuevoEnvio({ ...SOLICITUD_VALIDA, valorCobro: 0 });
    assert.equal(resultado.error, ERRORES.COBRO_INVALIDO);
  });

  it('pone el valor de cobro en 0 si el envío no es contra entrega', () => {
    const envio = prepararNuevoEnvio({ ...SOLICITUD_VALIDA, contraEntrega: false });
    assert.equal(envio.valorCobro, 0);
    assert.equal(envio.estado, ESTADOS.CREADO);
  });
});
