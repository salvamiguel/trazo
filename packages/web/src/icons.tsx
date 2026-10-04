// Small stroke icons (Tabler-style) used across the UI.
type P = { size?: number };
const base = (size = 16) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const Sun = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const Moon = ({ size }: P) => (<svg {...base(size)}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>);
export const Download = ({ size }: P) => (<svg {...base(size)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>);
export const Plus = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const Minus = ({ size }: P) => (<svg {...base(size)}><path d="M5 12h14" /></svg>);
export const Fit = ({ size }: P) => (<svg {...base(size)}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>);
export const Command = ({ size }: P) => (<svg {...base(size)}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" /></svg>);
export const Alert = ({ size }: P) => (<svg {...base(size)}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>);
export const Check = ({ size }: P) => (<svg {...base(size)}><path d="M5 12l5 5L20 7" /></svg>);
export const Reset = ({ size }: P) => (<svg {...base(size)}><path d="M4 4v6h6" /><path d="M20 12A8 8 0 0 0 5.6 7.2L4 10M4 12a8 8 0 0 0 14.4 4.8" /></svg>);
export const Logo = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M8 22h6V10h10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="10" r="2.5" fill="#fff" />
  </svg>
);
