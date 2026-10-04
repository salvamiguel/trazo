import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Layout, Pin, PinSide, PlacedEdge, PlacedNode, Point } from '@trazo/core';
import { DRAG_TYPE } from './Library.tsx';
import { Fit, Minus, Plus } from './icons.tsx';

export type Tool = 'select' | 'connect';
export type Selection = { kind: 'node' | 'edge'; id: string };

interface Props {
  svg?: string;
  layout?: Layout;
  /** Changes when the diagram should be re-fitted (e.g. another view). */
  fitKey: string;
  busy: boolean;
  tool: Tool;
  selection?: Selection;
  /** Whether the view nests elements (false when its hierarchy is "none"). */
  canNest: boolean;
  onSelect: (sel: Selection | undefined) => void;
  onOpen: (id: string) => void;
  onConnect: (source: string, target: string) => void;
  /** A connection dropped on empty space: the app asks what to create there. */
  onConnectToEmpty: (source: string, screen: Point, group: string | undefined) => void;
  onReparent: (id: string, group: string | undefined) => void;
  /** Pins of the current view, marked on the canvas. */
  pins: Pin[];
  /** An element dropped inside its own group: keep it on that side of the nearest sibling. */
  onPin: (id: string, pin: { side: PinSide; of: string }) => void;
  onDropEntry: (key: string, group: string | undefined) => void;
}

const MIN = 0.1;
const MAX = 4;
const HANDLE_R = 9;

type Gesture =
  | { kind: 'pan'; x: number; y: number; moved: boolean; startedOn?: Selection }
  | { kind: 'node'; id: string; grab: Point; start: Point; moved: boolean }
  | { kind: 'connect'; from: string };

interface Live {
  /** Pointer in diagram coordinates during a gesture. */
  at?: Point;
  /** Element the gesture would land on (connect target or group). */
  target?: string;
  dragging?: string;
  /** While dragging inside the element's own group: where it would be pinned. */
  pin?: { side: PinSide; of: string };
  connecting?: string;
  hover?: string;
}

/** Icon plus label: what a reader sees as "the element". */
function outline(n: PlacedNode) {
  if (n.isGroup) return { x: n.x, y: n.y, width: n.width, height: n.height };
  const x1 = Math.min(n.x, n.label.x), y1 = Math.min(n.y, n.label.y);
  const x2 = Math.max(n.x + n.width, n.label.x + n.label.width), y2 = Math.max(n.y + n.height, n.label.y + n.label.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const inside = (p: Point, b: { x: number; y: number; width: number; height: number }, pad = 0) =>
  p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;

function segDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const PIN_LABEL: Record<PinSide, string> = {
  'right-of': 'A la derecha de',
  'left-of': 'A la izquierda de',
  above: 'Encima de',
  below: 'Debajo de',
};

function handleOf(n: PlacedNode): Point {
  return n.isGroup ? { x: n.x + n.width, y: n.y + n.height / 2 } : { x: n.x + n.width + 14, y: n.y + n.height / 2 };
}

/** Pan and zoom over the rendered SVG, plus the editing gestures drawn on an overlay. */
export function Canvas(props: Props) {
  const { svg, layout, fitKey, busy, tool, selection, canNest } = props;
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const gesture = useRef<Gesture | null>(null);
  const [live, setLive] = useState<Live>({});
  const fitted = useRef<string>('');
  /** Set once the user pans or zooms; until then the diagram keeps fitting itself as it grows. */
  const userMoved = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const fit = useCallback(() => {
    const box = host.current?.getBoundingClientRect();
    if (!layout || !box) return;
    const k = Math.min(1, Math.max(MIN, Math.min((box.width - 96) / layout.width, (box.height - 96) / layout.height)));
    setView({ k, x: (box.width - layout.width * k) / 2, y: (box.height - layout.height * k) / 2 });
    userMoved.current = false;
  }, [layout]);

  useLayoutEffect(() => {
    if (!layout || !fitKey) return;
    if (fitted.current !== fitKey || !userMoved.current) {
      fitted.current = fitKey;
      fit();
    }
  }, [layout, fitKey, fit]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left, py = e.clientY - box.top;
      userMoved.current = true;
      setView((v) => {
        // Like Figma and draw.io: the wheel pans, ctrl/⌘ + wheel (and trackpad pinch) zooms.
        if (!e.ctrlKey && !e.metaKey) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const k = Math.min(MAX, Math.max(MIN, v.k * Math.exp(-e.deltaY * 0.01)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    const px = box.width / 2, py = box.height / 2;
    userMoved.current = true;
    setView((v) => {
      const k = Math.min(MAX, Math.max(MIN, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };

  // ---- Geometry in diagram coordinates ----------------------------------------------------
  const toDiagram = (clientX: number, clientY: number): Point => {
    const box = host.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - box.left - v.x) / v.k, y: (clientY - box.top - v.y) / v.k };
  };
  const byId = new Map((layout?.nodes ?? []).map((n) => [n.id, n]));
  const isWithin = (id: string, ancestor: string) => {
    for (let p: string | undefined = id; p; p = byId.get(p)?.parent) if (p === ancestor) return true;
    return false;
  };
  const nodeAt = (p: Point): PlacedNode | undefined => {
    const nodes = layout?.nodes ?? [];
    const leaf = nodes.find((n) => !n.isGroup && inside(p, outline(n), 4));
    if (leaf) return leaf;
    return groupAt(p);
  };
  const groupAt = (p: Point, exclude?: string): PlacedNode | undefined =>
    (layout?.nodes ?? [])
      .filter((n) => n.isGroup && inside(p, n) && !(exclude && isWithin(n.id, exclude)))
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  const edgeAt = (p: Point): PlacedEdge | undefined => {
    const tol = 6 / viewRef.current.k;
    return layout?.edges.find((e) => e.points.some((a, i) => i > 0 && segDistance(p, e.points[i - 1]!, a) < tol));
  };
  const selectedNode = selection?.kind === 'node' ? byId.get(selection.id) : undefined;
  const onHandle = (p: Point) => {
    if (!selectedNode) return false;
    const h = handleOf(selectedNode);
    return Math.hypot(p.x - h.x, p.y - h.y) <= (HANDLE_R + 4) / viewRef.current.k;
  };

  /** Side of the nearest sibling the pointer is on, for a drag that stays in the same group. */
  const pinAt = (p: Point, id: string): Live['pin'] => {
    const self = byId.get(id);
    if (!self || inside(p, outline(self))) return undefined;
    let best: { n: PlacedNode; d: number } | undefined;
    for (const n of layout?.nodes ?? []) {
      if (n.id === id || n.parent !== self.parent) continue;
      const b = outline(n);
      const d = Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.width), Math.max(b.y - p.y, 0, p.y - b.y - b.height));
      if (!best || d < best.d) best = { n, d };
    }
    if (!best) return undefined;
    const b = outline(best.n);
    const dx = (p.x - (b.x + b.width / 2)) / (b.width / 2 + 30), dy = (p.y - (b.y + b.height / 2)) / (b.height / 2 + 30);
    const side: PinSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right-of' : 'left-of') : dy > 0 ? 'below' : 'above';
    return { side, of: best.n.id };
  };
  /** Reparenting wins when the pointer is over another group; otherwise the drop pins. */
  const dropFor = (p: Point, id: string): Pick<Live, 'target' | 'pin'> => {
    const target = canNest ? groupAt(p, id)?.id : byId.get(id)?.parent;
    if (target !== byId.get(id)?.parent) return { target };
    return { pin: pinAt(p, id) };
  };

  // ---- Gestures --------------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !layout) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toDiagram(e.clientX, e.clientY);
    if (onHandle(p) && selectedNode) {
      gesture.current = { kind: 'connect', from: selectedNode.id };
      setLive({ connecting: selectedNode.id, at: p });
      return;
    }
    const node = nodeAt(p);
    if (node && tool === 'connect') {
      gesture.current = { kind: 'connect', from: node.id };
      setLive({ connecting: node.id, at: p });
      return;
    }
    // Groups are dragged by their title bar; their body pans like empty canvas.
    const grabbable = node && (!node.isGroup || p.y - node.y < 34);
    if (node && grabbable) {
      gesture.current = { kind: 'node', id: node.id, grab: p, start: { x: e.clientX, y: e.clientY }, moved: false };
      return;
    }
    const edge = edgeAt(p);
    gesture.current = {
      kind: 'pan', x: e.clientX, y: e.clientY, moved: false,
      startedOn: edge ? { kind: 'edge', id: edge.id } : node ? { kind: 'node', id: node.id } : undefined,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const p = layout && host.current ? toDiagram(e.clientX, e.clientY) : undefined;
    if (!g) {
      if (p) {
        const hover = onHandle(p) ? '__handle' : (nodeAt(p)?.id ?? (edgeAt(p) ? '__edge' : undefined));
        if (hover !== live.hover) setLive({ hover });
      }
      return;
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      userMoved.current = true;
      g.x = e.clientX;
      g.y = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    if (!p) return;
    if (g.kind === 'node') {
      if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 4) return;
      g.moved = true;
      setLive({ dragging: g.id, at: p, ...dropFor(p, g.id) });
      return;
    }
    const over = nodeAt(p);
    setLive({ connecting: g.from, at: p, target: over && over.id !== g.from ? over.id : undefined });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setLive({});
    if (!g || !layout) return;
    const p = toDiagram(e.clientX, e.clientY);
    if (g.kind === 'pan') {
      if (!g.moved) props.onSelect(g.startedOn);
      return;
    }
    if (g.kind === 'node') {
      if (!g.moved) return props.onSelect({ kind: 'node', id: g.id });
      const drop = dropFor(p, g.id);
      if (drop.pin) props.onPin(g.id, drop.pin);
      else if (canNest && drop.target !== byId.get(g.id)?.parent) props.onReparent(g.id, drop.target);
      return;
    }
    const over = nodeAt(p);
    if (over && over.id !== g.from) return props.onConnect(g.from, over.id);
    if (!over) {
      const box = host.current!.getBoundingClientRect();
      props.onConnectToEmpty(g.from, { x: e.clientX - box.left, y: e.clientY - box.top }, groupAt(p)?.id);
    }
  };

  // ---- Animated layout changes ---------------------------------------------------------------
  // Each new layout replaces the SVG; nodes then glide from where they were (FLIP) and edges,
  // which are re-routed, fade back in. A new view or reduced motion just swaps the picture.
  const previous = useRef<{ key: string; boxes: Map<string, { x: number; y: number; width: number; height: number }> } | undefined>(undefined);
  useLayoutEffect(() => {
    const root = content.current;
    if (!root || !layout) return;
    const prev = previous.current;
    previous.current = { key: fitKey, boxes: new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width, height: n.height }])) };
    if (!prev || prev.key !== fitKey || typeof root.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timing = { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' };
    let changed = false;
    for (const n of layout.nodes) {
      const el = root.querySelector<SVGGElement>(`g[data-id="${CSS.escape(n.id)}"]`);
      if (!el) continue;
      const old = prev.boxes.get(n.id);
      if (!old) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, delay: 120, fill: 'backwards' });
        changed = true;
        continue;
      }
      const dx = old.x - n.x, dy = old.y - n.y;
      const resized = old.width !== n.width || old.height !== n.height;
      if (!dx && !dy && !resized) continue;
      changed = true;
      const glide = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
      if (!n.isGroup) {
        el.animate(glide, timing);
        continue;
      }
      // Group frames grow or shrink in place; their title and badge glide with the corner.
      const [frame, ...rest] = Array.from(el.children) as SVGElement[];
      frame?.animate(
        [
          { x: `${old.x}px`, y: `${old.y}px`, width: `${old.width}px`, height: `${old.height}px` },
          { x: `${n.x}px`, y: `${n.y}px`, width: `${n.width}px`, height: `${n.height}px` },
        ],
        timing,
      );
      for (const child of rest) child.animate(glide, timing);
    }
    if (!changed) return;
    for (const el of root.querySelectorAll<SVGElement>('path[data-id], g[data-label]')) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 220, easing: 'ease-out', fill: 'backwards' });
    }
  }, [svg]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const k = view.k;

  // ---- Overlay -----------------------------------------------------------------------------
  const overlay = layout && (
    <svg className="overlay" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {(() => {
        const t = live.target ?? dropTarget ?? undefined;
        const n = t ? byId.get(t) : undefined;
        if (!n) return null;
        const b = outline(n);
        return <rect className="ov-target" x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={10} strokeWidth={2 / k} />;
      })()}
      {live.pin && (() => {
        const n = byId.get(live.pin.of);
        if (!n) return null;
        const b = outline(n);
        const gap = 10;
        const bar =
          live.pin.side === 'right-of' ? { x1: b.x + b.width + gap, y1: b.y, x2: b.x + b.width + gap, y2: b.y + b.height }
          : live.pin.side === 'left-of' ? { x1: b.x - gap, y1: b.y, x2: b.x - gap, y2: b.y + b.height }
          : live.pin.side === 'above' ? { x1: b.x, y1: b.y - gap, x2: b.x + b.width, y2: b.y - gap }
          : { x1: b.x, y1: b.y + b.height + gap, x2: b.x + b.width, y2: b.y + b.height + gap };
        return (
          <>
            <rect className="ov-pin-ref" x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={10} strokeWidth={1.5 / k} />
            <line className="ov-pin-bar" {...bar} strokeWidth={4 / k} />
          </>
        );
      })()}
      {props.pins.map((pin) => {
        const n = byId.get(pin.id);
        if (!n || live.dragging === pin.id) return null;
        return (
          <g key={pin.id} className="ov-pinned" transform={`translate(${n.isGroup ? n.x + n.width : n.x + n.width + 2} ${n.y - 2}) scale(${Math.min(1.6, 1 / k)})`}>
            <title>{`${PIN_LABEL[pin.side]} ${byId.get(pin.of)?.label.lines[0]?.text ?? pin.of}`}</title>
            <circle r={7} />
            <path className="head" d="M-2.6 -3.8h5.2l-0.9 2.8h-3.4z" />
            <path d="M-3.4 -1h6.8M0 -1v4.6" />
          </g>
        );
      })}
      {selection?.kind === 'edge' && (() => {
        const edge = layout.edges.find((e) => e.id === selection.id);
        return edge ? <polyline className="ov-edge" points={edge.points.map((q) => `${q.x},${q.y}`).join(' ')} strokeWidth={4 / k} /> : null;
      })()}
      {selectedNode && !live.dragging && (() => {
        const b = outline(selectedNode);
        const h = handleOf(selectedNode);
        return (
          <>
            <rect className="ov-select" x={b.x - 5} y={b.y - 5} width={b.width + 10} height={b.height + 10} rx={selectedNode.isGroup ? 9 : 14} strokeWidth={2 / k} />
            <g className={`ov-handle${live.hover === '__handle' ? ' hot' : ''}`} transform={`translate(${h.x} ${h.y}) scale(${1 / k})`}>
              <circle r={HANDLE_R} />
              <path d="M-4 0h8M0 -4v8" />
            </g>
          </>
        );
      })()}
      {live.dragging && live.at && (() => {
        const n = byId.get(live.dragging);
        if (!n) return null;
        const w = n.isGroup ? Math.min(n.width, 220) : n.width, h = n.isGroup ? 34 : n.height;
        const ref = live.pin ? byId.get(live.pin.of)?.label.lines[0]?.text : undefined;
        return (
          <>
            <rect className="ov-ghost" x={live.at.x - w / 2} y={live.at.y - h / 2} width={w} height={h} rx={12} strokeWidth={1.5 / k} />
            {live.pin && ref && (
              <g transform={`translate(${live.at.x} ${live.at.y + h / 2 + 8}) scale(${1 / k})`}>
                <text className="ov-pin-text" y={12} textAnchor="middle">{`${PIN_LABEL[live.pin.side]} ${ref}`}</text>
              </g>
            )}
          </>
        );
      })()}
      {live.connecting && live.at && (() => {
        const n = byId.get(live.connecting);
        if (!n) return null;
        const from = n.isGroup ? handleOf(n) : { x: n.x + n.width / 2, y: n.y + n.height / 2 };
        return <line className="ov-wire" x1={from.x} y1={from.y} x2={live.at.x} y2={live.at.y} strokeWidth={2 / k} strokeDasharray={`${6 / k} ${4 / k}`} />;
      })()}
    </svg>
  );

  const cursor = live.connecting ? 'crosshair' : live.dragging ? 'grabbing' : live.hover === '__handle' ? 'crosshair' : tool === 'connect' ? (live.hover ? 'crosshair' : 'grab') : live.hover ? 'pointer' : 'grab';

  return (
    <div
      ref={host}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !gesture.current && live.hover && setLive({})}
      onDoubleClick={(e) => {
        if (!layout) return;
        const n = nodeAt(toDiagram(e.clientX, e.clientY));
        if (n) props.onOpen(n.id);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE) || !layout) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const g = canNest ? groupAt(toDiagram(e.clientX, e.clientY))?.id ?? null : null;
        if (g !== dropTarget) setDropTarget(g);
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => {
        const key = e.dataTransfer.getData(DRAG_TYPE);
        setDropTarget(null);
        if (!key) return;
        e.preventDefault();
        props.onDropEntry(key, canNest && layout ? groupAt(toDiagram(e.clientX, e.clientY))?.id : undefined);
      }}
    >
      <div className="canvas-content" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <div ref={content} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
        {overlay}
      </div>
      {!svg && <div className="canvas-empty">{busy ? 'Calculando layout…' : 'Corrige los errores del modelo para ver el diagrama'}</div>}
      <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Alejar" onClick={() => zoomBy(1 / 1.25)}><Minus /></button>
        <button className="zoom-level" title="Ajustar a la pantalla" onClick={fit}>{Math.round(view.k * 100)}%</button>
        <button className="icon-btn" title="Acercar" onClick={() => zoomBy(1.25)}><Plus /></button>
        <span className="sep" />
        <button className="icon-btn" title="Ajustar (F)" onClick={fit}><Fit /></button>
      </div>
      {busy && svg && <div className="busy-dot" title="Recalculando" />}
    </div>
  );
}
