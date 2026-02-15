import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';
declare global {
  interface HTMLElementTagNameMap {
    'linak-desk-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
  interface Window {
    customCards?: { 
      type: string;
      description: string;
      name: string; 
      preview?: boolean;
    }[];
  }
}

export interface LinakDeskCardConfig extends LovelaceCardConfig {
  name?: string;
  hide_title?: boolean;
  desk: string;
  moving_sensor?: string;
  connection_sensor?: string;
  height_sensor: string;
  max_height: number;
  min_height: number;
  sit_height?: number;
  stand_height?: number;
  presets: {
    target: number;
    label: string;
  }[];
}

export type DeskState = 'sit' | 'raising' | 'stand' | 'lowering';
