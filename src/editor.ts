import {
  LitElement,
  html,
  customElement,
  property,
  TemplateResult,
  css,
  CSSResult,
} from 'lit-element';
import { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { LinakDeskCardConfig } from './types';
import { localize } from './localize/localize';

@customElement('linak-desk-card-editor')
export class LinakDeskCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property() private _config?: LinakDeskCardConfig;

  public setConfig(config: LinakDeskCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${[
          { name: 'name', selector: { text: {} } },
          {
            type: 'expandable',
            title: localize('editor.section_entities'),
            schema: [
              { name: 'desk', required: true, selector: { entity: { domain: 'cover' } } },
              { name: 'height_sensor', required: true, selector: { entity: { domain: 'sensor' } } },
              { name: 'connection_sensor', selector: { entity: { domain: 'binary_sensor' } } },
              { name: 'moving_sensor', selector: { entity: { domain: 'binary_sensor' } } },
            ],
          },
          {
            type: 'expandable',
            title: localize('editor.section_height'),
            schema: [
              { name: 'min_height', required: true, selector: { number: { mode: 'box', step: 0.1 } } },
              { name: 'max_height', required: true, selector: { number: { mode: 'box', step: 0.1 } } },
              { name: 'sit_height', selector: { number: { mode: 'box', step: 0.1 } } },
              { name: 'stand_height', selector: { number: { mode: 'box', step: 0.1 } } },
            ],
          },
        ]}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel(schema): string {
    if (schema.name) {
      return localize(`editor.${schema.name}`) || schema.name;
    }
    return schema.title || '';
  }

  private _valueChanged(ev: CustomEvent): void {
    const event = new CustomEvent('config-changed', {
      detail: { config: ev.detail.value },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  static get styles(): CSSResult {
    return css`
      ha-form {
        display: block;
        padding: 16px 0;
      }
    `;
  }
}
