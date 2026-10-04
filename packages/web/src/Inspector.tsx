import { useEffect, useRef, useState } from 'react';
import type { Element, GroupStyle, Model, Relationship } from '@trazo/core';
import { NODE_TYPES, PROTOCOLS, type NodeFields } from './edit.ts';
import { IconGlyph } from './IconGlyph.tsx';
import { Picker } from './Library.tsx';
import { Close, Code, Swap, Trash } from './icons.tsx';

const GROUP_STYLES: Array<[GroupStyle | '', string]> = [
  ['', 'Ninguno'],
  ['aws-cloud', 'AWS Cloud'],
  ['aws-account', 'Cuenta AWS'],
  ['aws-region', 'Región'],
  ['aws-vpc', 'VPC'],
  ['aws-az', 'Zona de disponibilidad'],
  ['aws-subnet-public', 'Subnet pública'],
  ['aws-subnet-private', 'Subnet privada'],
  ['aws-security-group', 'Security group'],
  ['k8s-cluster', 'Clúster Kubernetes'],
  ['k8s-namespace', 'Namespace'],
  ['system', 'Límite de sistema'],
  ['generic', 'Grupo'],
];

const NODE_TYPE_LABELS: Record<string, string> = {
  actor: 'Persona (actor)',
  system: 'Sistema',
  service: 'Servicio',
  database: 'Base de datos',
  network: 'Red',
  webclient: 'Cliente web',
  'data-asset': 'Datos',
  ecosystem: 'Ecosistema',
  ldap: 'LDAP',
};

/** Text input that writes to the model when the user leaves it or presses Enter. */
function Field({ label, value, onCommit, multiline, placeholder, autoFocus }: {
  label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);
  const commit = () => text !== value && onCommit(text.trim());
  const common = {
    ref,
    value: text,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit();
        (e.target as HTMLElement).blur();
      }
      if (e.key === 'Escape') {
        setText(value);
        (e.target as HTMLElement).blur();
      }
    },
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea rows={2} {...common} /> : <input {...common} />}
    </label>
  );
}

function SelectField({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

interface ElementProps {
  element: Element;
  model: Model;
  parent?: string;
  /** Possible containers, already filtered to avoid cycles. */
  containers: Element[];
  canNest: boolean;
  focusName: number;
  onChange: (fields: NodeFields) => void;
  onParent: (parent: string | undefined) => void;
  onDelete: () => void;
  onReveal: () => void;
  onClose: () => void;
}

export function ElementInspector(p: ElementProps) {
  const e = p.element;
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [e.id]);
  const iconRef = e.icon ?? undefined;
  return (
    <aside className="inspector" onPointerDown={(ev) => ev.stopPropagation()}>
      <header>
        <span className="insp-icon"><IconGlyph icon={iconRef ?? fallbackIcon(e)} size={26} /></span>
        <div className="insp-title">
          <h2>{e.name}</h2>
          <code>{e.id}</code>
        </div>
        <button className="icon-btn small" title="Ver en el YAML" onClick={p.onReveal}><Code size={15} /></button>
        <button className="icon-btn small" title="Cerrar (Esc)" onClick={p.onClose}><Close size={15} /></button>
      </header>
      <div className="insp-body">
        <Field key={`name-${e.id}-${p.focusName}`} label="Nombre" value={e.name} onCommit={(v) => v && p.onChange({ name: v })} autoFocus={p.focusName > 0} />
        <Field label="Descripción" value={e.description ?? ''} multiline onCommit={(v) => p.onChange({ description: v })} />
        <div className="field-row">
          <SelectField
            label="Tipo"
            value={e.nodeType}
            options={NODE_TYPES.map((t) => [t, NODE_TYPE_LABELS[t] ?? t])}
            onChange={(v) => p.onChange({ 'node-type': v })}
          />
          <Field label="Tecnología" value={e.technology ?? ''} placeholder="p. ej. Spring Boot" onCommit={(v) => p.onChange({ technology: v })} />
        </div>
        <div className="field">
          <span>Icono</span>
          <div className="icon-field">
            <button className="ghost-btn" onClick={() => setPicking((v) => !v)}>
              <IconGlyph icon={iconRef ?? fallbackIcon(e)} size={18} /> {iconRef ?? 'Por defecto'}
            </button>
            {iconRef && <button className="link-btn" onClick={() => p.onChange({ icon: '' })}>Quitar</button>}
          </div>
          {picking && (
            <div className="icon-picker">
              <Picker
                sections={['aws', 'k8s', 'ai', 'iac', 'data', 'cloud']}
                placeholder="Buscar icono…"
                onPick={(entry) => {
                  p.onChange({ icon: entry.icon ?? entry.preview, ...(e.technology ? {} : entry.technology ? { technology: entry.technology } : {}) });
                  setPicking(false);
                }}
                onEscape={() => setPicking(false)}
              />
            </div>
          )}
        </div>
        <SelectField
          label="Dentro de"
          value={p.parent ?? ''}
          disabled={!p.canNest}
          options={[['', 'Nivel superior'], ...p.containers.map((c): [string, string] => [c.id, c.name])]}
          onChange={(v) => p.onParent(v || undefined)}
        />
        <SelectField
          label="Estilo de grupo"
          value={e.groupStyle ?? ''}
          options={GROUP_STYLES}
          onChange={(v) => p.onChange({ 'group-style': (v || undefined) as GroupStyle | undefined })}
        />
      </div>
      <footer>
        <button className="danger-btn" onClick={p.onDelete}><Trash size={15} /> Eliminar</button>
        <span className="kbd-hint">Supr</span>
      </footer>
    </aside>
  );
}

export function RelationshipInspector({ rel, model, onChange, onReverse, onDelete, onClose }: {
  rel: Relationship;
  model: Model;
  onChange: (f: { description?: string; protocol?: string }) => void;
  onReverse: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const src = model.elements.get(rel.source), dst = model.elements.get(rel.target);
  const fromActor = src?.nodeType === 'actor';
  return (
    <aside className="inspector" onPointerDown={(ev) => ev.stopPropagation()}>
      <header>
        <div className="insp-title">
          <h2>Relación</h2>
          <code>{rel.id}</code>
        </div>
        <button className="icon-btn small" title="Cerrar (Esc)" onClick={onClose}><Close size={15} /></button>
      </header>
      <div className="insp-body">
        <div className="rel-ends">
          <span><IconGlyph icon={src?.icon ?? (src && fallbackIcon(src))} size={18} /> {src?.name ?? rel.source}</span>
          <span className="arrow">→</span>
          <span><IconGlyph icon={dst?.icon ?? (dst && fallbackIcon(dst))} size={18} /> {dst?.name ?? rel.target}</span>
        </div>
        <Field key={`d-${rel.id}`} label="Descripción" value={rel.description ?? ''} placeholder="p. ej. Publica eventos" onCommit={(v) => onChange({ description: v })} />
        <SelectField
          label="Protocolo"
          value={rel.protocol ?? ''}
          options={[['', 'Sin especificar'], ...PROTOCOLS.map((x): [string, string] => [x, x])]}
          onChange={(v) => onChange({ protocol: v })}
        />
        <button className="ghost-btn" onClick={onReverse} disabled={fromActor} title={fromActor ? 'Una persona siempre inicia la interacción' : undefined}>
          <Swap size={15} /> Invertir sentido
        </button>
      </div>
      <footer>
        <button className="danger-btn" onClick={onDelete}><Trash size={15} /> Eliminar</button>
        <span className="kbd-hint">Supr</span>
      </footer>
    </aside>
  );
}

const DEFAULT_ICONS: Record<string, string> = {
  actor: 'tabler:user', system: 'tabler:box', ecosystem: 'tabler:world', service: 'tabler:server', database: 'tabler:database',
  network: 'tabler:network', ldap: 'tabler:address-book', webclient: 'tabler:browser', 'data-asset': 'tabler:file',
};
function fallbackIcon(e: Element) {
  return DEFAULT_ICONS[e.nodeType] ?? 'tabler:box';
}
