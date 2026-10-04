import type { WorkspaceSources } from '@trazo/core';
import model from '../../../examples/aws-pagos/architecture.calm.yaml?raw';
import infra from '../../../examples/aws-pagos/views/infra-aws.view.yaml?raw';
import c4 from '../../../examples/aws-pagos/views/contenedores-c4.view.yaml?raw';

export const EXAMPLE_NAME = 'aws-pagos';
export const EXAMPLE: WorkspaceSources = {
  model,
  views: { 'infra-aws': infra, 'contenedores-c4': c4 },
};
