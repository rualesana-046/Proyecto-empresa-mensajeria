# 01 · Drivers y árbol de utilidad

> Proyecto de Arquitectura de Software · [NOMBRE 1], [NOMBRE 2], [NOMBRE 3] · [GRUPO 5A/5B]

## Los tres drivers principales y de dónde salen

| Driver | Enunciado                                                                                | Origen (quién o qué regla lo exige)                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | El estado de un envío llega al cliente en **< 3 s** después de cada cambio.              | **Remitente y destinatario**: quieren saber dónde está su paquete sin recargar ni llamar a la empresa. Es la promesa de servicio visible del negocio.                                                                                  |
| **D2** | **Ningún cobro contra entrega se pierde ni se duplica**, aunque se caiga un servicio.    | **Regla de negocio del cobro contra entrega** + **restricción externa de la pasarela** (puede fallar o no responder). Un cobro perdido es dinero que no entra; uno duplicado es un cliente cobrado dos veces (reclamo y riesgo legal). |
| **D3** | La asignación de pedidos a mensajeros crece de **100 a 1.000 envíos/día sin rediseñar**. | **Operador / dirección de la empresa**: plan de crecimiento. La regla "cada mensajero tiene capacidad y zona" es la que vuelve delicada la asignación.                                                                                 |

### Nota honesta sobre D3: es difícil por concurrencia, no por volumen

1.000 envíos/día ÷ 86.400 s/día ≈ **0,012 envíos/s** (≈ 1 envío cada 86 s en promedio; aun concentrados en 8 horas laborales son ≈ 0,035/s). Cualquier servidor atiende eso. Lo difícil de D3 es:

1. **Corrección bajo concurrencia:** dos asignaciones simultáneas no pueden consumir el mismo cupo de un mensajero ni asignar dos veces el mismo envío. Esto aparece en cuanto hay más de un proceso asignando, sin importar el volumen.
2. **No acoplar la asignación al resto:** si la asignación cambia de reglas (zonas, prioridades) o necesita réplicas, no debe obligar a tocar Envíos ni Cobros.

Por eso D3 lleva importancia **alta** pero dificultad **media**, no alta.

## Rol del operador: decisión de alcance

El enunciado dice que el operador "asigna rutas". En este diseño **la asignación es automática** (por zona y capacidad, servicio `asignacion`) y el operador queda como **supervisor**: consulta los cobros (`GET /cobros`) y la carga de cada mensajero (`GET /mensajeros`, que solo es accesible dentro de la red de Docker porque `asignacion` no publica puerto para poder escalar).

- **Por qué (D3):** con 1.000 envíos/día concentrados en 8 horas hay una asignación cada ~29 s; una persona asignando a mano sería el cuello de botella y además la fuente de errores de cupo que D3 pide evitar.
- **Qué se pierde:** el criterio humano (conocer el tráfico, preferir a un mensajero). La reasignación manual por el operador **no está implementada**; sería una funcionalidad nueva de `asignacion`, fuera del esqueleto.
- **Pendiente para el equipo:** confirmar esta interpretación con el docente o defenderla explícitamente en la sustentación.

## Árbol de utilidad

Cada hoja es medible y lleva **(Importancia, Dificultad)** con A = alta, M = media, B = baja. Los drivers principales están marcados con ★.

```
Utilidad
├── Desempeño
│   └── ★ D1 · Un cambio de estado llega al cliente por SSE en < 3 s (p100 en la demo) ........ (A, M)
├── Confiabilidad / integridad
│   ├── ★ D2 · Cero cobros perdidos y cero duplicados con la pasarela fallando 30 %
│   │         y con el servicio Cobros caído o matado a mitad del cobro ...................... (A, A)
│   └── Trazabilidad: cada cobro guarda intentos, último error, referencia y fecha ............ (M, B)
├── Escalabilidad
│   └── ★ D3 · Con N réplicas de asignacion, 0 asignaciones duplicadas y 0 mensajeros
│             sobre su capacidad al pasar de 100 a 1.000 envíos/día ......................... (A, M)
├── Disponibilidad
│   └── Si Notificaciones cae, recoger, entregar y cobrar siguen funcionando ................ (M, B)
├── Modificabilidad
│   └── Cambiar de proveedor de pasarela tocando solo pasarela-cliente.js y config.js ........ (M, M)
├── Seguridad / cumplimiento
│   └── Datos personales (nombres, direcciones) tratados según la Ley 1581 de 2012 ........... (M, M)
└── Despliegue
    └── El sistema completo arranca con un solo comando (docker compose up --build) .......... (B, B)
```

**El árbol discrimina:** solo una hoja es (A, A) —D2—, dos son (A, M), tres son (M, M) o (M, B) y una es (B, B). Eso dice dónde se gasta el esfuerzo de diseño: casi todas las tácticas "caras" (outbox, idempotencia, alquiler, trabajador de cobro) apuntan a D2.

Por qué cada valor:

- **D1 (A, M):** importa mucho al cliente, pero 3 s es holgado; el riesgo real es elegir mal el canal (polling). Con push se midió 56–107 ms en 5 corridas seguidas (RECOGIDO 56–73 ms; EN_RUTA y ENTREGADO 102–107 ms).
- **D2 (A, A):** es dinero; y es difícil porque combina tres fallos (pasarela que no responde, respuesta perdida después de cobrar, caída del propio servicio) que no se resuelven con una sola táctica.
- **Trazabilidad (M, B):** útil para auditoría y reclamos; sale casi gratis porque Cobros ya guarda su tabla.
- **Notificaciones caído (M, B):** molesto para el cliente, pero no pierde dinero ni envíos; baja dificultad porque Notificaciones no está en el camino de escritura de nadie.
- **Cambiar de pasarela (M, M):** probable a mediano plazo (comisiones, cobertura); dificultad media porque cada pasarela tiene su forma de idempotencia (ver riesgo R3).
- **Ley 1581 (M, M):** obligatoria, pero este esqueleto no la implementa (ver restricciones).
- **Arranque con un comando (B, B):** lo exige el curso, no el negocio; Docker Compose lo resuelve.

## Restricciones (no se negocian; acotan el diseño)

| Restricción                                                                                                     | Tipo                 | Efecto en el diseño                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pasarela de pagos externa: puede fallar (503), tardar o cobrar y no responder; acepta **llave de idempotencia** | Técnica externa      | Obliga a timeouts, reintentos y a usar la misma llave en cada reintento (ADR-002).                                                                                                                                                         |
| **Ley 1581 de 2012** (protección de datos personales, Colombia): se manejan nombres y direcciones               | Legal / cumplimiento | Se documenta como restricción; el esqueleto **no** implementa autorización del titular, cifrado ni retención. Sí se minimiza el dato: a la pasarela solo viajan monto, id del envío y llave; los eventos llevan dirección pero no nombres. |
| Equipo de 3 estudiantes, un semestre                                                                            | Organizacional       | Se evita Kafka/Kubernetes; se elige un stack pequeño y conocido.                                                                                                                                                                           |
| Stack acordado: Node.js 22, Express, Redis Streams, PostgreSQL, Docker Compose                                  | Técnica acordada     | Fija el broker (ADR-003) y el lenguaje.                                                                                                                                                                                                    |
