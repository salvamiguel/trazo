/** Starting points for a new workspace. Every template is valid CALM 1.2. */
import type { WorkspaceSources } from '@trazo/core';
import { EXAMPLE } from './example.ts';

export interface Template {
  id: string;
  name: string;
  description: string;
  sources: WorkspaceSources;
}

const SCHEMA = '$schema: https://calm.finos.org/release/1.2/meta/calm.json\n';

const BLANK_MODEL = `${SCHEMA}
nodes: []

relationships: []
`;

const AWS_MODEL = `${SCHEMA}
nodes:
  - unique-id: usuarios
    node-type: actor
    name: Usuarios
    description: Quien usa el sistema
  - unique-id: aws
    node-type: ecosystem
    name: AWS Cloud
    description: Cuenta de producción
    metadata:
      trazo: { group-style: aws-cloud }
  - unique-id: region
    node-type: ecosystem
    name: Región eu-west-1
    description: Región principal
    metadata:
      trazo: { group-style: aws-region }
  - unique-id: vpc
    node-type: network
    name: VPC
    description: 10.0.0.0/16
    metadata:
      trazo: { group-style: aws-vpc }
  - unique-id: az-a
    node-type: network
    name: Zona de disponibilidad A
    description: eu-west-1a
    metadata:
      trazo: { group-style: aws-az }
  - unique-id: az-b
    node-type: network
    name: Zona de disponibilidad B
    description: eu-west-1b
    metadata:
      trazo: { group-style: aws-az }
  - unique-id: public-a
    node-type: network
    name: Subred pública A
    description: 10.0.0.0/24
    metadata:
      trazo: { group-style: aws-subnet-public }
  - unique-id: private-a
    node-type: network
    name: Subred privada A
    description: 10.0.10.0/24
    metadata:
      trazo: { group-style: aws-subnet-private }
  - unique-id: public-b
    node-type: network
    name: Subred pública B
    description: 10.0.1.0/24
    metadata:
      trazo: { group-style: aws-subnet-public }
  - unique-id: private-b
    node-type: network
    name: Subred privada B
    description: 10.0.11.0/24
    metadata:
      trazo: { group-style: aws-subnet-private }
  - unique-id: alb
    node-type: service
    name: Load Balancer
    description: Entrada HTTPS
    metadata:
      trazo: { technology: ALB, icon: aws/elb }
  - unique-id: app
    node-type: service
    name: Aplicación
    description: Servicio principal
    metadata:
      trazo: { technology: ECS, icon: aws/ecs }
  - unique-id: bd
    node-type: database
    name: Base de datos
    description: Datos de la aplicación
    metadata:
      trazo: { technology: RDS, icon: aws/rds }

relationships:
  - unique-id: d-aws
    relationship-type:
      deployed-in: { container: aws, nodes: [region] }
  - unique-id: d-region
    relationship-type:
      deployed-in: { container: region, nodes: [vpc] }
  - unique-id: d-vpc
    relationship-type:
      deployed-in: { container: vpc, nodes: [az-a, az-b] }
  - unique-id: d-az-a
    relationship-type:
      deployed-in: { container: az-a, nodes: [public-a, private-a] }
  - unique-id: d-az-b
    relationship-type:
      deployed-in: { container: az-b, nodes: [public-b, private-b] }
  - unique-id: d-public-a
    relationship-type:
      deployed-in: { container: public-a, nodes: [alb] }
  - unique-id: d-private-a
    relationship-type:
      deployed-in: { container: private-a, nodes: [app] }
  - unique-id: d-private-b
    relationship-type:
      deployed-in: { container: private-b, nodes: [bd] }
  - unique-id: r-usuarios-alb
    description: Usa la app
    protocol: HTTPS
    relationship-type:
      interacts: { actor: usuarios, nodes: [alb] }
  - unique-id: r-alb-app
    protocol: HTTPS
    relationship-type:
      connects: { source: { node: alb }, destination: { node: app } }
  - unique-id: r-app-bd
    description: Lee y escribe
    protocol: JDBC
    relationship-type:
      connects: { source: { node: app }, destination: { node: bd } }
`;

const C4_MODEL = `${SCHEMA}
nodes:
  - unique-id: cliente
    node-type: actor
    name: Cliente
    description: Usuario de la aplicación
  - unique-id: sistema
    node-type: system
    name: Mi sistema
    description: El sistema que se describe
    metadata:
      trazo: { group-style: system }
  - unique-id: web
    node-type: webclient
    name: App web
    description: Interfaz de usuario
    metadata:
      trazo: { technology: React, icon: logos:react, c4: container }
  - unique-id: api
    node-type: service
    name: API
    description: Lógica de negocio
    metadata:
      trazo: { technology: Spring Boot, icon: logos:spring-icon, c4: container }
  - unique-id: bd
    node-type: database
    name: Base de datos
    description: Datos de negocio
    metadata:
      trazo: { technology: PostgreSQL, icon: logos:postgresql, c4: container }
  - unique-id: correo
    node-type: system
    name: Servicio de correo
    description: Sistema externo
    metadata:
      trazo: { c4: system }

relationships:
  - unique-id: c-sistema
    relationship-type:
      composed-of: { container: sistema, nodes: [web, api, bd] }
  - unique-id: r-cliente-web
    description: Usa
    protocol: HTTPS
    relationship-type:
      interacts: { actor: cliente, nodes: [web] }
  - unique-id: r-web-api
    description: Llama a la API
    protocol: HTTPS
    relationship-type:
      connects: { source: { node: web }, destination: { node: api } }
  - unique-id: r-api-bd
    description: Lee y escribe
    protocol: JDBC
    relationship-type:
      connects: { source: { node: api }, destination: { node: bd } }
  - unique-id: r-api-correo
    description: Envía avisos
    relationship-type:
      connects: { source: { node: api }, destination: { node: correo } }
`;

export const VIEW_KINDS = {
  'aws-infra': { label: 'Infraestructura AWS', hint: 'Cuentas, VPC, zonas y subnets', preset: 'aws-infra', hierarchy: 'deployment' },
  'c4-container': { label: 'C4 contenedores', hint: 'Sistemas y sus contenedores', preset: 'c4-container', hierarchy: 'composition' },
  free: { label: 'Libre', hint: 'Agrupado por despliegue, sin preset', preset: undefined, hierarchy: 'deployment' },
  flat: { label: 'Sin grupos', hint: 'Solo elementos y relaciones', preset: undefined, hierarchy: 'none' },
} as const;
export type ViewKind = keyof typeof VIEW_KINDS;

/** YAML for a new view. `include` undefined = every element; [] = start empty. */
export function viewYaml(title: string, kind: ViewKind, include?: string[]): string {
  const k = VIEW_KINDS[kind];
  return [
    `title: ${title}`,
    ...(k.preset ? [`preset: ${k.preset}`] : []),
    `hierarchy: ${k.hierarchy}`,
    ...(include ? [`include: [${include.join(', ')}]`] : []),
    'layout:',
    '  direction: right',
    '',
  ].join('\n');
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Un modelo vacío con una vista',
    sources: { model: BLANK_MODEL, views: { principal: viewYaml('Diagrama', 'free') } },
  },
  {
    id: 'aws',
    name: 'Infraestructura AWS',
    description: 'VPC con dos zonas y subnets públicas y privadas',
    sources: { model: AWS_MODEL, views: { 'infra-aws': viewYaml('Infraestructura AWS', 'aws-infra') } },
  },
  {
    id: 'c4',
    name: 'C4 contenedores',
    description: 'Una persona, tu sistema y sus contenedores',
    sources: { model: C4_MODEL, views: { contenedores: viewYaml('Contenedores', 'c4-container') } },
  },
  {
    id: 'example',
    name: 'Ejemplo: pagos en AWS',
    description: 'Modelo completo con vista AWS y vista C4',
    sources: EXAMPLE,
  },
];
