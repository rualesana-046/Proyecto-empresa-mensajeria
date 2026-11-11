import { leerEntero, leerTexto } from '../../shared/config.js';

const capacidad = leerEntero('CAPACIDAD_MENSAJERO', 20);

export const CONFIG = Object.freeze({
  servicio: 'asignacion',
  puerto: leerEntero('PUERTO', 3002),
  baseDeDatos: leerTexto('DB_NOMBRE', 'asignacion_db'),
  mensajerosSemilla: Object.freeze([
    { id: 'm-norte-1', nombre: 'Mensajero Norte 1', zona: 'norte', capacidad },
    { id: 'm-norte-2', nombre: 'Mensajero Norte 2', zona: 'norte', capacidad },
    { id: 'm-sur-1', nombre: 'Mensajero Sur 1', zona: 'sur', capacidad },
    { id: 'm-sur-2', nombre: 'Mensajero Sur 2', zona: 'sur', capacidad },
  ]),
});
