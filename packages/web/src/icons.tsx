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
export const Close = ({ size }: P) => (<svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Search = ({ size }: P) => (<svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const Pointer = ({ size }: P) => (<svg {...base(size)}><path d="M6 3l12 9-5.5 1.2L15 20l-2.6 1.1-2.6-6.6L6 18z" /></svg>);
export const Connect = ({ size }: P) => (<svg {...base(size)}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8 16L16 8" /></svg>);
export const Shapes = ({ size }: P) => (<svg {...base(size)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><circle cx="17" cy="7" r="3.5" /><path d="M7 14l3.5 6.5h-7z" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>);
export const Undo = ({ size }: P) => (<svg {...base(size)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>);
export const Redo = ({ size }: P) => (<svg {...base(size)}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>);
export const Trash = ({ size }: P) => (<svg {...base(size)}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>);
export const Swap = ({ size }: P) => (<svg {...base(size)}><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>);
export const Code = ({ size }: P) => (<svg {...base(size)}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></svg>);
export const ChevronDown = ({ size }: P) => (<svg {...base(size)}><path d="M6 9l6 6 6-6" /></svg>);
export const Folder = ({ size }: P) => (<svg {...base(size)}><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>);
export const Dots = ({ size }: P) => (<svg {...base(size)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>);
export const Eye = ({ size }: P) => (<svg {...base(size)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const History = ({ size }: P) => (<svg {...base(size)}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>);
export const Image = ({ size }: P) => (<svg {...base(size)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-9 8.5" /></svg>);
export const PanelLeft = ({ size }: P) => (<svg {...base(size)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15M15.5 10l-2 2 2 2" /></svg>);
