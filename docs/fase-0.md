# Fase 0: spike técnico

_4 de octubre de 2026_

Objetivo: comprobar que el layout automático deja diagramas de arquitectura limpios y que CALM sirve como lenguaje fuente. El plan de producto completo vive en los ficheros del proyecto (`plan/plan-producto-tecnico.md`).

## Qué hay

- Cargador de CALM 1.2 en YAML con validación contra el **meta-esquema oficial** (vendorizado en `packages/core/schemas/calm-1.2`).
- Proyección de vistas: misma fuente, jerarquía de despliegue (`deployed-in`) o lógica C4 (`composed-of`).
- Layout con ELK layered: `INCLUDE_CHILDREN` para grupos anidados, routing ortogonal, etiquetas de nodo y de arista reservadas en el layout, y **un puerto por extremo en el propio icono** (nunca en la caja icono+texto).
- Post-proceso de aristas: elimina puntos duplicados y colineales y pliega zig-zags de menos de 3 px sin mover los extremos.
- Render SVG con temas claro y oscuro (colores de grupo según la guía de AWS, iconos sobre placa para mantener contraste en oscuro).
- Export `.drawio` sin comprimir: grupos como contenedores, coordenadas relativas al padre, anclajes `exit/entry` y waypoints del layout.
- Métricas de calidad automáticas y tests que fallan si una vista del ejemplo empeora.

## Resultados con el ejemplo `aws-pagos`

| Vista | Nodos | Aristas | Cruces | Quiebros (máx/arista) | Solapes de etiquetas | Flechas que atraviesan iconos | Puntas mal ancladas |
|---|---|---|---|---|---|---|---|
| Contenedores C4 | 10 | 7 | 0 | 6 (2) | 0 | 0 | 0 |
| Infra AWS | 16 | 16 | 1 | 26 (4) | 0 | 0 | 0 |

## Hallazgos

1. **CALM sirve como formato fuente.** `node-type` admite cadenas libres, `metadata` admite objetos libres y nodos y relaciones aceptan propiedades adicionales, así que todo lo de Trazo cabe sin romper la validación estándar. Limitación: `protocol` es un enum cerrado (HTTP, HTTPS, JDBC, AMQP, TCP…); gRPC, Kafka o SQS van en `metadata.trazo.protocol`.
2. **La anidación AWS no es un árbol.** En los diagramas AWS de referencia las AZ son filas y los tiers de subred son columnas. Con ELK tal cual, las AZ acababan una detrás de otra y la vista salía de unos 4.700 px de ancho para 16 nodos. **Resuelto en el preset `aws-infra`** (ver abajo): ahora mide unos 3.250 px y respeta la rejilla AZ × tier.
3. **Huecos dentro de los grupos.** Cada borde de grupo que cruza una arista añade una capa de espaciado; con 4 niveles de anidación se nota. Se puede compactar con un pase posterior que encoja los grupos a su contenido.
4. **draw.io:** el XML generado es válido y conserva contenedores y waypoints, pero falta comprobar a ojo en draw.io que `orthogonalEdgeStyle` respeta exactamente nuestros waypoints (desde este entorno no se puede abrir draw.io).

## Cómo funciona el preset `aws-infra`

- **Particiones por tier** en cada nivel del grafo (ELK solo las aplica por nivel): servicios de borde → subredes públicas → subredes privadas → servicios regionales y externos.
- **Aristas hacia atrás invertidas** para ELK (p. ej. subred privada → NAT en la pública) y vueltas a su sentido después; con grafos anidados ELK no respeta las particiones frente a ellas.
- **Las AZ son "overlays":** ELK no las ve, sus subredes se colocan directamente en la VPC y la AZ se dibuja después alrededor de ellas. Si dos AZ chocan, se amplía el espaciado y se repite el layout (máximo 3 pasadas).
- **Aristas entre AZ del mismo tier** (replicación de Aurora) se trazan fuera de ELK con una "C" por el lado este, para no cruzar las etiquetas. Todavía no esquivan obstáculos: en el ejemplo producen el único cruce. Se resolverá con libavoid.

## Siguientes pasos propuestos

1. Probar con 3 diagramas reales anonimizados y comparar con el auto-layout ELK que draw.io incorporó en 2026.
2. Routing con libavoid para las aristas trazadas fuera de ELK, compactación de grupos y orden de filas (AZ a arriba).
3. Iconos oficiales AWS y Azure (paquetes de arquitectura) en lugar de Iconify `logos`.
4. Forma de persona y estilo C4 propio para el preset C4.
