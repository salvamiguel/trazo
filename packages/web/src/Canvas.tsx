import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Fit, Minus, Plus } from './icons.tsx';

interface Props {
  svg?: string;
  /** Changes when the diagram should be re-fitted (e.g. another view). */
  fitKey: string;
  busy: boolean;
  selected?: string;
  onSelect: (id: string | undefined) => void;
}

const MIN = 0.1;
const MAX = 4;

/** Pan (drag) and zoom (wheel / pinch / buttons) over the rendered SVG. */
export function Canvas({ svg, fitKey, busy, selected, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const fitted = useRef<string>('');

  const size = useCallback(() => {
    const el = content.current?.querySelector('svg');
    return el ? { w: Number(el.getAttribute('width')), h: Number(el.getAttribute('height')) } : undefined;
  }, []);

  const fit = useCallback(() => {
    const s = size();
    const box = host.current?.getBoundingClientRect();
    if (!s || !box) return;
    const k = Math.min(MAX, Math.max(MIN, Math.min((box.width - 64) / s.w, (box.height - 64) / s.h)));
    setView({ k, x: (box.width - s.w * k) / 2, y: (box.height - s.h * k) / 2 });
  }, [size]);

  useLayoutEffect(() => {
    if (svg && fitted.current !== fitKey) {
      fitted.current = fitKey;
      fit();
    }
  }, [svg, fitKey, fit]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left, py = e.clientY - box.top;
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
    setView((v) => {
      const k = Math.min(MAX, Math.max(MIN, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };

  return (
    <div
      ref={host}
      className={`canvas${drag.current ? ' dragging' : ''}`}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: false };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        d.x = e.clientX;
        d.y = e.clientY;
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]');
          const id = target?.getAttribute('data-id');
          onSelect(id ?? undefined);
        }
      }}
    >
      {selected && <style>{`.canvas-content [data-id="${CSS.escape(selected)}"] { filter: drop-shadow(0 0 0.5px var(--accent)) drop-shadow(0 0 6px var(--accent)); }`}</style>}
      <div
        ref={content}
        className="canvas-content"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
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
