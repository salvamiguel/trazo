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

/** AWS group colours follow the official architecture-icon guidelines; Azure ones the Azure icon palette. */
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
      'azure-management-group': { stroke: '#5c2d91', fill: 'none', text: '#5c2d91', dashed: false },
      'azure-subscription': { stroke: '#c69200', fill: 'none', text: '#8a6600', dashed: false },
      'azure-resource-group': { stroke: '#8a8886', fill: 'none', text: '#605e5c', dashed: true },
      'azure-region': { stroke: '#0078d4', fill: 'none', text: '#0078d4', dashed: true },
      'azure-vnet': { stroke: '#3a8d1f', fill: '#f4f9f1', text: '#2c6e17', dashed: false },
      'azure-subnet': { stroke: '#5ea0ef', fill: '#eef5fd', text: '#0f5a9e', dashed: false },
      'azure-az': { stroke: '#5c7cfa', fill: 'none', text: '#4c63d2', dashed: true },
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
      'azure-management-group': { stroke: '#a57de0', fill: 'none', text: '#b896ff', dashed: false },
      'azure-subscription': { stroke: '#f2c037', fill: 'none', text: '#f5cd5a', dashed: false },
      'azure-resource-group': { stroke: '#8f98a3', fill: 'none', text: '#a9b1bb', dashed: true },
      'azure-region': { stroke: '#4aa3f0', fill: 'none', text: '#6cb4f2', dashed: true },
      'azure-vnet': { stroke: '#6cc04a', fill: '#121c0f', text: '#8bd36c', dashed: false },
      'azure-subnet': { stroke: '#5ea0ef', fill: '#0d1826', text: '#7fb5f2', dashed: false },
      'azure-az': { stroke: '#8199fb', fill: 'none', text: '#97abfc', dashed: true },
      'k8s-cluster': { stroke: '#5b8cf0', fill: '#111a2c', text: '#7ea3f3', dashed: false },
      'k8s-namespace': { stroke: '#5b8cf0', fill: 'none', text: '#7ea3f3', dashed: true },
      system: { stroke: '#5aa2ec', fill: 'none', text: '#7db6f0', dashed: true },
      generic: { stroke: '#6b7685', fill: 'none', text: '#9aa4b2', dashed: true },
    },
  },
};
