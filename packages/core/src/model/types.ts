/** Internal, view-independent representation of an architecture loaded from CALM. */

export type GroupStyle =
  | 'aws-cloud'
  | 'aws-account'
  | 'aws-region'
  | 'aws-vpc'
  | 'aws-az'
  | 'aws-subnet-public'
  | 'aws-subnet-private'
  | 'aws-security-group'
  | 'azure-management-group'
  | 'azure-subscription'
  | 'azure-resource-group'
  | 'azure-region'
  | 'azure-vnet'
  | 'azure-subnet'
  | 'azure-az'
  | 'k8s-cluster'
  | 'k8s-namespace'
  | 'system'
  | 'generic';

export interface Element {
  id: string;
  name: string;
  description?: string;
  /** CALM node-type (standard enum or free string). */
  nodeType: string;
  technology?: string;
  /** Icon reference, e.g. "aws/eks" or "logos:kubernetes". */
  icon?: string;
  c4?: 'person' | 'system' | 'container' | 'component';
  /** Optional layout tier: lower tiers are placed earlier along the flow direction. */
  tier?: number;
  /** Visual style when the element is drawn as a group. */
  groupStyle?: GroupStyle;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  description?: string;
  protocol?: string;
}

export type Hierarchy = 'deployment' | 'composition' | 'none';

export interface Model {
  elements: Map<string, Element>;
  relationships: Relationship[];
  /** child id -> container id, from CALM `deployed-in`. */
  deployedIn: Map<string, string>;
  /** child id -> container id, from CALM `composed-of`. */
  composedOf: Map<string, string>;
}

export type Direction = 'right' | 'down' | 'left' | 'up';

export type PinSide = 'right-of' | 'left-of' | 'above' | 'below';
export const PIN_SIDES: PinSide[] = ['right-of', 'left-of', 'above', 'below'];

/** A layout hint from the view: keep `id` on one side of `of`, a sibling in the same group. */
export interface Pin {
  id: string;
  side: PinSide;
  of: string;
}

export interface View {
  id: string;
  title?: string;
  preset?: string;
  /** Which CALM containment relationship draws the nesting. */
  hierarchy: Hierarchy;
  /** Leaf elements to show; ancestors are added automatically. Empty = all. */
  include: string[];
  /** True when the view has no `include` list and shows every element. */
  includeAll: boolean;
  direction: Direction;
  /** `layout.pinned` in the view file. */
  pins: Pin[];
  /** `layout.edges`: auto (default), bundled or separate. */
  edges?: 'auto' | 'bundled' | 'separate';
}

export interface Diagnostic {
  level: 'error' | 'warning';
  message: string;
}
