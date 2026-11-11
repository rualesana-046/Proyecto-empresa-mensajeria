# 09 · Convenciones de código

> [NOMBRE 1], [NOMBRE 2], [NOMBRE 3] · [GRUPO 5A/5B]

Resumen de las reglas que sigue el código. Respetarlas al modificarlo.

## Capas de cada servicio

| Archivo            | Qué contiene                                                                                  | Puede depender de                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `index.js`         | Solo arranque: configuración, conexiones, registro de rutas y suscripciones, apagado ordenado | todo lo del servicio y `shared/`                                                     |
| `config.js`        | Valores configurables leídos de variables de entorno con valor por defecto                    | `shared/config.js`                                                                   |
| `rutas.js`         | Entrada HTTP: validar, llamar a la lógica, responder con el código correcto                   | `dominio.js`, `repositorio.js`, `shared/http.js`                                     |
| `suscripciones.js` | Entrada por eventos: qué eventos escucha el servicio y qué hace con cada uno                  | `dominio.js`, `repositorio.js`                                                       |
| `dominio.js`       | Reglas de negocio **puras** (sin red ni base de datos). Se prueban con `node:test`            | solo `shared/eventos.js` (constantes del contrato)                                   |
| `repositorio.js`   | **Todo** el SQL del servicio                                                                  | `dominio.js` (solo constantes y funciones puras), `shared/db.js`, `shared/outbox.js` |

Archivos extra justificados: `cobros/trabajador.js` (bucle de cobro), `cobros/pasarela-cliente.js` (adaptador del sistema externo), `notificaciones/historial.js` (estado en memoria), `pasarela-mock/libro.js` (libro simulado).

**`shared/`** solo tiene el contrato de mensajería (`eventos.js`) e infraestructura (`bus.js`, `suscripcion.js`, `db.js`, `outbox.js`, `http.js`, `log.js`, `apagado.js`, `tiempo.js`, `config.js`). **Nunca lógica de negocio.**

## Reglas

- **Una responsabilidad por función**, idealmente < 25 líneas. Si un bloque necesita comentario, conviértelo en una función con buen nombre.
- **Sin valores mágicos:** puertos, URLs, tiempos, tasas y capacidades van en `config.js`; estados y eventos en `ESTADOS_ENVIO`, `ESTADOS_COBRO` y `EVENTOS`; códigos HTTP en `HTTP` (`shared/http.js`).
- **Errores explícitos:** ningún `catch` vacío; los errores de infraestructura se registran con contexto (`logger.error(qué se intentaba, error, envioId)`). Validar en el borde HTTP: 400 (entrada inválida), 404 (no existe), 409 (transición inválida), 422 (regla de negocio).
- **Logs:** solo con `crearLogger(servicio)`; formato `[servicio] (envio <id>) mensaje`.
- **Apagado ordenado:** cada servicio cierra HTTP, bucles, bus y pool al recibir `SIGTERM`/`SIGINT`.
- **Todo consumidor es idempotente:** el mismo evento puede llegar dos veces.
- **Ningún servicio lee la base de otro** ni llama por HTTP a otro servicio de negocio.

## Nombres

- `camelCase` para variables y funciones, `MAYUSCULAS_CON_GUION_BAJO` para constantes, `kebab-case` para carpetas.
- **Términos del dominio en español** (`envio`, `cobro`, `mensajero`, `zona`, `carga`); términos técnicos estándar como son (`pool`, `handler`, `outbox`, `publish`, `subscribe`).
- Nombres que revelan intención: `reclamarCobrosPendientes`, `bloquearSiTieneCupo`.

## Comentarios

- En español, una línea (máximo dos), y explican **por qué**, no qué.
- Prohibido: repetir el código, párrafos largos (van en `docs/`), banners, código comentado, frases genéricas.
- Cada función exportada lleva un JSDoc de una o dos líneas.

## Herramientas

```bash
npm run lint      # ESLint (config plana, reglas recomendadas), debe dar 0 errores y 0 advertencias
npm run format    # Prettier
npm test          # node:test sobre services/**/dominio.test.js
```
