import { execFileSync } from 'node:child_process';
import { ESTADOS_ENVIO as ESTADOS, EVENTOS } from '../shared/eventos.js';
import { CONFIG_SCRIPTS as C } from './lib/config.mjs';
import { crearEnvio, esperarAsignado, llevarHasta } from './lib/mensajeria.mjs';
import { crearVerificador } from './lib/verificador.mjs';

const verificador = crearVerificador();
const { verificar } = verificador;
// Todos en la misma zona: así las réplicas compiten por los mismos dos mensajeros
const ZONA_DISPUTADA = 'norte';

function consultarAsignacionDb(sql) {
  const argumentos = ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'mensajeria_dev'];
  const salida = execFileSync('docker', [
    ...argumentos,
    '-d',
    'asignacion_db',
    '-At',
    '-F',
    ',',
    '-c',
    sql,
  ]);
  return salida.toString().trim().split('\n').filter(Boolean);
}

function contarReplicas() {
  return execFileSync('docker', ['compose', 'ps', '-q', 'asignacion']).toString().trim().split('\n')
    .length;
}

function repartoPorReplica(envioIds) {
  const logs = execFileSync('docker', ['compose', 'logs', '--no-color', 'asignacion'])
    .toString()
    .split('\n');
  const reparto = {};
  for (const linea of logs) {
    const esNuestra = envioIds.some((id) => linea.includes(id)) && linea.includes('asignado a');
    if (esNuestra) reparto[linea.split(' ')[0]] = (reparto[linea.split(' ')[0]] ?? 0) + 1;
  }
  return reparto;
}

function verificarConsistencia(etiqueta) {
  const descuadres = consultarAsignacionDb(
    `SELECT m.id, m.carga, m.capacidad, count(a.envio_id) FROM mensajeros m
     LEFT JOIN asignaciones a ON a.mensajero_id = m.id AND NOT a.liberada
     GROUP BY m.id HAVING m.carga <> count(a.envio_id) OR m.carga > m.capacidad`,
  );
  verificar(
    descuadres.length === 0,
    `${etiqueta}: carga == asignaciones activas y carga <= capacidad`,
  );
}

function verificarSinDuplicados(envioIds) {
  const lista = envioIds.map((id) => `'${id}'`).join(',');
  const repetidos = consultarAsignacionDb(
    `SELECT data->>'envioId' FROM outbox WHERE type = '${EVENTOS.ENVIO_ASIGNADO}'
     AND data->>'envioId' IN (${lista}) GROUP BY 1 HAVING count(*) > 1`,
  );
  verificar(repetidos.length === 0, `ningún envío generó dos eventos ${EVENTOS.ENVIO_ASIGNADO}`);
}

await verificador.ejecutar(async () => {
  const replicas = contarReplicas();
  console.log(
    `\nEscala: ${C.enviosEscala} envíos simultáneos en la zona ${ZONA_DISPUTADA}, ${replicas} réplica(s) de asignacion`,
  );
  const envioIds = await Promise.all(
    Array.from({ length: C.enviosEscala }, () =>
      crearEnvio({ zona: ZONA_DISPUTADA, contraEntrega: false }),
    ),
  );
  await Promise.all(envioIds.map(esperarAsignado));
  verificar(true, `los ${envioIds.length} envíos quedaron ASIGNADO`);

  console.log('  · reparto por réplica:', repartoPorReplica(envioIds));
  console.log(
    '  · carga actual:',
    consultarAsignacionDb('SELECT id, carga, capacidad FROM mensajeros ORDER BY id').join('  '),
  );
  verificarSinDuplicados(envioIds);
  verificarConsistencia('con los envíos activos');

  await Promise.all(envioIds.map((id) => llevarHasta(id, ESTADOS.ENTREGADO)));
  verificarConsistencia('tras entregarlos');
});
