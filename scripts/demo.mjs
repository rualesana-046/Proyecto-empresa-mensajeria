import Redis from 'ioredis';
import { ESTADOS_ENVIO as ESTADOS, EVENTOS, streamDe } from '../shared/eventos.js';
import { HTTP } from '../shared/http.js';
import { CONFIG_SCRIPTS as C } from './lib/config.mjs';
import { pedir } from './lib/http.mjs';
import {
  consultarCobro,
  crearEnvio,
  esperarAsignado,
  esperarCobroConfirmado,
  esperarSinCobrosPendientes,
  estadisticasPasarela,
  llevarHasta,
  reportarEstado,
} from './lib/mensajeria.mjs';
import { abrirSse } from './lib/sse.mjs';
import { crearVerificador } from './lib/verificador.mjs';

const verificador = crearVerificador();
const { verificar } = verificador;

const CAMBIOS_MEDIDOS = Object.freeze([
  [ESTADOS.RECOGIDO, EVENTOS.ENVIO_RECOGIDO],
  [ESTADOS.EN_RUTA, EVENTOS.ENVIO_EN_RUTA],
  [ESTADOS.ENTREGADO, EVENTOS.ENVIO_ENTREGADO],
]);

async function paso1LatenciaYMaquinaDeEstados() {
  console.log('\n1) D1: latencia del cambio de estado hasta el cliente (SSE)');
  const envioId = await crearEnvio();
  const sse = await abrirSse(`${C.notificacionesUrl}/seguimiento/${envioId}/stream`);
  await esperarAsignado(envioId);

  for (const [estado, tipo] of CAMBIOS_MEDIDOS) {
    const inicio = Date.now();
    await reportarEstado(envioId, estado);
    const evento = await sse.esperarEvento((e) => e.type === tipo, C.latenciaMaximaMs * 2);
    const latencia = evento.recibidoEn - inicio;
    verificar(
      latencia < C.latenciaMaximaMs,
      `${estado}: ${latencia} ms petición→SSE (servidor reporta ${evento.latenciaMs} ms)`,
    );
  }

  const status = await reportarEstado(envioId, ESTADOS.EN_RUTA);
  verificar(status === HTTP.CONFLICTO, `ENTREGADO → EN_RUTA es inválida y responde ${status}`);
  await verificarValidacionDeEntrada();

  const cobro = await esperarCobroConfirmado(envioId);
  const confirmacion = await sse.esperarEvento(
    (e) => e.type === EVENTOS.COBRO_CONFIRMADO,
    C.esperaCobrosMs,
  );
  verificar(
    Boolean(confirmacion),
    `cobro.confirmado llegó por SSE tras ${cobro.intentos} intento(s) en la pasarela`,
  );
  await sse.cerrar();
}

async function verificarValidacionDeEntrada() {
  const incompleto = await pedir('POST', `${C.enviosUrl}/envios`, { remitente: 'X' });
  verificar(
    incompleto.status === HTTP.SOLICITUD_INVALIDA,
    `envío sin campos obligatorios responde ${incompleto.status}`,
  );
  const sinValor = await pedir('POST', `${C.enviosUrl}/envios`, {
    remitente: 'X',
    destinatario: 'Y',
    direccion: 'Z',
    zona: 'norte',
    contraEntrega: true,
    valorCobro: 0,
  });
  verificar(
    sinValor.status === HTTP.NO_PROCESABLE,
    `contra entrega con valorCobro 0 responde ${sinValor.status}`,
  );
}

async function paso2PrepararNoEntregado() {
  console.log('\n2) Envío contra entrega que termina NO_ENTREGADO (se verifica al final)');
  const envioId = await crearEnvio({ zona: 'sur' });
  await esperarAsignado(envioId);
  await llevarHasta(envioId, ESTADOS.NO_ENTREGADO);
  console.log(`  · envío ${envioId} quedó NO_ENTREGADO`);
  return envioId;
}

async function paso3RafagaDeCobros() {
  console.log(
    `\n3) D2: ráfaga de ${C.rafaga} envíos contra entrega con la pasarela fallando a propósito`,
  );
  await esperarSinCobrosPendientes();
  const antes = await estadisticasPasarela();
  const inicio = Date.now();

  const envios = await Promise.all(
    Array.from({ length: C.rafaga }, (_, i) => entregarUno(i % 2 === 0 ? 'norte' : 'sur')),
  );
  const cobros = await Promise.all(envios.map(esperarCobroConfirmado));
  const despues = await estadisticasPasarela();

  const cobrosReales = despues.cobrosReales - antes.cobrosReales;
  const intentos = despues.intentos - antes.intentos;
  const repetidos = despues.repetidosIgnorados - antes.repetidosIgnorados;
  console.log(`  · ${cobros.length} cobros CONFIRMADO en ${Date.now() - inicio} ms`);
  console.log(
    `  · pasarela: ${intentos} intentos, ${cobrosReales} cobros reales, ${repetidos} repetidos ignorados`,
  );
  verificar(
    cobrosReales === envios.length,
    `cobros reales (${cobrosReales}) == envíos entregados contra entrega (${envios.length})`,
  );
  verificar(
    intentos > cobrosReales,
    `hubo reintentos reales (${intentos} intentos > ${cobrosReales} cobros)`,
  );
}

async function entregarUno(zona) {
  const envioId = await crearEnvio({ zona });
  await esperarAsignado(envioId);
  await llevarHasta(envioId, ESTADOS.ENTREGADO);
  return envioId;
}

async function paso4GruposDeConsumo() {
  console.log('\n4) Un evento, varios consumidores independientes (XINFO GROUPS)');
  const redis = new Redis(C.redisUrl);
  try {
    await mostrarGrupos(redis, EVENTOS.ENVIO_ENTREGADO, ['asignacion', 'cobros', 'notificaciones']);
    await mostrarGrupos(redis, EVENTOS.ENVIO_ASIGNADO, ['envios', 'notificaciones']);
  } finally {
    await redis.quit();
  }
}

async function mostrarGrupos(redis, tipo, esperados) {
  const grupos = (await redis.xinfo('GROUPS', streamDe(tipo))).map(aObjeto);
  console.log(`  ${streamDe(tipo)}:`);
  for (const g of grupos) {
    console.log(
      `    - grupo ${g.name}: consumidores=${g.consumers} pendientes=${g.pending} último=${g['last-delivered-id']}`,
    );
  }
  const nombres = grupos.map((g) => g.name).sort();
  verificar(
    esperados.every((n) => nombres.includes(n)),
    `${tipo} lo consumen por separado: ${nombres.join(', ')}`,
  );
}

function aObjeto(plano) {
  const objeto = {};
  for (let i = 0; i < plano.length; i += 2) objeto[plano[i]] = plano[i + 1];
  return objeto;
}

async function verificarNoEntregadoSinCobro(envioId) {
  console.log('\n5) Verificación final del envío NO_ENTREGADO');
  verificar(
    (await consultarCobro(envioId)) === null,
    `el envío NO_ENTREGADO ${envioId} no tiene cobro`,
  );
}

await verificador.ejecutar(async () => {
  await paso1LatenciaYMaquinaDeEstados();
  const noEntregado = await paso2PrepararNoEntregado();
  await paso3RafagaDeCobros();
  await paso4GruposDeConsumo();
  await verificarNoEntregadoSinCobro(noEntregado);
});
