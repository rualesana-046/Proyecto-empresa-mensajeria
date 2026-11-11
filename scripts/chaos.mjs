import { execFileSync } from 'node:child_process';
import Redis from 'ioredis';
import { ESTADOS_ENVIO as ESTADOS, EVENTOS, streamDe } from '../shared/eventos.js';
import { CONFIG_SCRIPTS as C } from './lib/config.mjs';
import { dormir } from './lib/http.mjs';
import {
  crearEnvio,
  esperarAsignado,
  esperarCobroConfirmado,
  esperarSinCobrosPendientes,
  estadisticasPasarela,
  reportarEstado,
} from './lib/mensajeria.mjs';
import { crearVerificador } from './lib/verificador.mjs';

const verificador = crearVerificador();
const { verificar } = verificador;

function dockerCompose(...argumentos) {
  console.log(`  $ docker compose ${argumentos.join(' ')}`);
  execFileSync('docker', ['compose', ...argumentos], { stdio: 'ignore' });
}

async function rezagoDelGrupoCobros() {
  const redis = new Redis(C.redisUrl);
  try {
    const grupos = await redis.xinfo('GROUPS', streamDe(EVENTOS.ENVIO_ENTREGADO));
    const cobros = grupos.find((plano) => plano[1] === 'cobros');
    // `lag` es cuántas entradas del stream aún no ha leído el grupo
    return cobros[cobros.indexOf('lag') + 1];
  } finally {
    await redis.quit();
  }
}

async function prepararEnvioEnRuta() {
  const envioId = await crearEnvio();
  await esperarAsignado(envioId);
  await reportarEstado(envioId, ESTADOS.RECOGIDO);
  await reportarEstado(envioId, ESTADOS.EN_RUTA);
  console.log(`  · envío ${envioId} EN_RUTA`);
  return envioId;
}

await verificador.ejecutar(async () => {
  console.log('\nCaos: Cobros cae justo antes de la entrega y vuelve después');
  await esperarSinCobrosPendientes();
  const envioId = await prepararEnvioEnRuta();
  const antes = await estadisticasPasarela();

  dockerCompose('stop', 'cobros');
  await reportarEstado(envioId, ESTADOS.ENTREGADO);
  console.log(`  · envío ENTREGADO con Cobros caído; esperando ${C.esperaSinCobroMs} ms`);
  await dormir(C.esperaSinCobroMs);

  const durante = await estadisticasPasarela();
  verificar(
    durante.intentos === antes.intentos,
    'con Cobros caído no hubo ningún intento de cobro',
  );
  const rezago = await rezagoDelGrupoCobros();
  verificar(
    rezago >= 1,
    `el evento envio.entregado espera en Redis (lag del grupo cobros = ${rezago})`,
  );

  dockerCompose('start', 'cobros');
  const cobro = await esperarCobroConfirmado(envioId);
  const despues = await estadisticasPasarela();
  const cobrosReales = despues.cobrosReales - antes.cobrosReales;
  console.log(`  · cobro ${cobro.cobroId} CONFIRMADO tras ${cobro.intentos} intento(s)`);
  verificar(cobrosReales === 1, `se ejecutó exactamente un cobro real (${cobrosReales})`);
});
