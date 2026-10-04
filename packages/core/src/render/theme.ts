import type { GroupStyle } from '../model/types.ts';

export type ThemeName = 'light' | 'dark';

export interface GroupTokens {
  stroke: string;
  fill: string;
  text: string;
  dashed: boolean;
}

export interface Theme {
  background: string;
  text: string;
  textMuted: string;
  edge: string;
  edgeLabelBg: string;
  iconPlate: string;
  iconPlateStroke: string;
  /** Stroke colour for monochrome icons, drawn on the icon plate. */
  iconMono: string;
  groups: Record<GroupStyle, GroupTokens>;
}

/** AWS group colours follow the official architecture-icon guidelines. */
export const THEMES: Record<ThemeName, Theme> = {
  light: {
    background: '#ffffff',
    text: '#1b1f24',
    textMuted: '#5b6472',
    edge: '#4a5361',
    edgeLabelBg: '#ffffff',
    iconPlate: '#ffffff',
    iconPlateStroke: '#e3e6ea',
    iconMono: '#3d4652',
    groups: {
      'aws-cloud': { stroke: '#232f3e', fill: 'none', text: '#232f3e', dashed: false },
      'aws-account': { stroke: '#cd2264', fill: 'none', text: '#cd2264', dashed: false },
      'aws-region': { stroke: '#00a4a6', fill: 'none', text: '#00a4a6', dashed: true },
      'aws-vpc': { stroke: '#8c4fff', fill: 'none', text: '#8c4fff', dashed: false },
      'aws-az': { stroke: '#147eba', fill: 'none', text: '#147eba', dashed: true },
      'aws-subnet-public': { stroke: '#7aa116', fill: '#f2f6e8', text: '#248814', dashed: false },
      'aws-subnet-private': { stroke: '#00a4a6', fill: '#e6f6f7', text: '#147eba', dashed: false },
      'aws-security-group': { stroke: '#dd3522', fill: 'none', text: '#dd3522', dashed: false },
      'k8s-cluster': { stroke: '#326ce5', fill: '#f3f6fd', text: '#326ce5', dashed: false },
      'k8s-namespace': { stroke: '#326ce5', fill: 'none', text: '#326ce5', dashed: true },
      system: { stroke: '#1168bd', fill: 'none', text: '#1168bd', dashed: true },
      generic: { stroke: '#8a94a3', fill: 'none', text: '#5b6472', dashed: true },
    },
  },
  dark: {
    background: '#0f1318',
    text: '#e8ebef',
    textMuted: '#9aa4b2',
    edge: '#aab3bf',
    edgeLabelBg: '#0f1318',
    iconPlate: '#f4f6f8',
    iconPlateStroke: '#2b323c',
    iconMono: '#3d4652',
    groups: {
      'aws-cloud': { stroke: '#c9d1d9', fill: 'none', text: '#e8ebef', dashed: false },
      'aws-account': { stroke: '#ff5fa8', fill: 'none', text: '#ff7fb9', dashed: false },
      'aws-region': { stroke: '#2fd0d2', fill: 'none', text: '#2fd0d2', dashed: true },
      'aws-vpc': { stroke: '#a97bff', fill: 'none', text: '#b896ff', dashed: false },
      'aws-az': { stroke: '#4fa8e0', fill: 'none', text: '#6cb8e8', dashed: true },
      'aws-subnet-public': { stroke: '#8fbf1f', fill: '#18200d', text: '#a6d43a', dashed: false },
      'aws-subnet-private': { stroke: '#22b8ba', fill: '#0b1d20', text: '#4fc6e0', dashed: false },
      'aws-security-group': { stroke: '#ff5a47', fill: 'none', text: '#ff7a6b', dashed: false },
      'k8s-cluster': { stroke: '#5b8cf0', fill: '#111a2c', text: '#7ea3f3', dashed: false },
      'k8s-namespace': { stroke: '#5b8cf0', fill: 'none', text: '#7ea3f3', dashed: true },
      system: { stroke: '#5aa2ec', fill: 'none', text: '#7db6f0', dashed: true },
      generic: { stroke: '#6b7685', fill: 'none', text: '#9aa4b2', dashed: true },
    },
  },
};
