export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelLine {
  text: string;
  kind: 'name' | 'tech' | 'edge' | 'group';
}

export interface PlacedLabel extends Box {
  lines: LabelLine[];
}

export interface PlacedNode extends Box {
  id: string;
  isGroup: boolean;
  depth: number;
  parent?: string;
  label: PlacedLabel;
}

export interface PlacedEdge {
  id: string;
  source: string;
  target: string;
  /** Orthogonal polyline from the source port to the target port, absolute coordinates. */
  points: Point[];
  label?: PlacedLabel;
}

export interface Layout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}
