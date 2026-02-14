import {
  LitElement,
  html,
  customElement,
  property,
  CSSResult,
  TemplateResult,
  css,
  PropertyValues,
  internalProperty,
} from 'lit-element';
import { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import type { LinakDeskCardConfig, DeskState } from './types';
import { localize } from './localize/localize';
import { HassEntity } from 'home-assistant-js-websocket';
import './editor';

window.customCards = window.customCards || [];
window.customCards.push({
  preview: true,
  type: 'linak-desk-card',
  name: localize('common.name'),
  description: localize('common.description'),
});

@customElement('linak-desk-card')
export class LinakDeskCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('linak-desk-card-editor');
  }

  public static getStubConfig(_: HomeAssistant, entities: string[]): Partial<LinakDeskCardConfig> {
      const [desk] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'cover' && eid.includes('desk'));
      const [height_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'sensor' && eid.includes('desk_height'));
      const [moving_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'binary_sensor' && eid.includes('desk_moving'));
      const [connection_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'binary_sensor' && eid.includes('desk_connection'));
    return {
      desk,
      height_sensor,
      moving_sensor,
      connection_sensor,
      min_height: 62,
      max_height: 127,
      sit_height: 78,
      stand_height: 106,
      presets: []
    };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;
  @internalProperty() private config!: LinakDeskCardConfig;

  public setConfig(config: LinakDeskCardConfig): void {
    if (!config.desk || !config.height_sensor) {
      throw new Error(localize('common.desk_and_height_required'));
    }

    if (!config.min_height || !config.max_height) {
      throw new Error(localize('common.min_and_max_height_required'));
    }

    this.config = {
      sit_height: 78,
      stand_height: 106,
      ...config
    };
  }

  get desk(): HassEntity {
    return this.hass.states[this.config.desk];
  }

  get height(): number {
    // Height sensor reports absolute height in cm
    return parseFloat(this.hass.states[this.config.height_sensor]?.state) || 0;
  }

  get relativeHeight(): number {
    // Calculate relative height (offset from minimum)
    return this.height - this.config.min_height;
  }

  get connected(): boolean {
    return this.hass.states[this.config.connection_sensor]?.state === 'on';
  }

  get moving(): boolean {
    return this.hass.states[this.config.moving_sensor]?.state === 'on';
  }

  get alpha(): number {
    // Percentage of desk range (0 to 1)
    return this.relativeHeight / (this.config.max_height - this.config.min_height);
  }

  get deskState(): DeskState {
    // Use desk_state_entity if configured
    if (this.config.desk_state_entity) {
      const entityState = this.hass.states[this.config.desk_state_entity]?.state;
      if (entityState === 'raising' || entityState === 'lowering' ||
          entityState === 'sit' || entityState === 'stand') {
        return entityState as DeskState;
      }
    }

    // Fallback to midpoint logic for backward compatibility
    const sitHeight = this.config.sit_height || 78;
    const standHeight = this.config.stand_height || 106;
    const midpoint = (sitHeight + standHeight) / 2;

    if (this.moving) {
      // Determine direction based on whether we're above or below midpoint
      return this.height >= midpoint ? 'lowering' : 'raising';
    }

    // Static state - determine sit vs stand based on which target is closer
    return this.height < midpoint ? 'sit' : 'stand';
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    if (changedProps.has('config')) {
      return true;
    }

    const newHass = changedProps.get('hass') as HomeAssistant | undefined;
    if (newHass) {
      return (
        newHass.states[this.config?.desk] !== this.hass?.states[this.config?.desk]
        || newHass.states[this.config?.connection_sensor]?.state !== this.hass?.states[this.config?.connection_sensor]?.state
        || newHass.states[this.config?.height_sensor]?.state !== this.hass?.states[this.config?.height_sensor]?.state
        || newHass.states[this.config?.moving_sensor]?.state !== this.hass?.states[this.config?.moving_sensor]?.state
      );
    }
    return true;
  }

  protected render(): TemplateResult | void {
    const state = this.deskState;
    let heightColor = '#60a5fa'; // sit blue

    if (state === 'stand') {
      heightColor = '#4ade80'; // stand green
    } else if (state === 'raising' || state === 'lowering') {
      heightColor = 'var(--grey-text, #9ca3af)'; // motion grey
    }

    // Round height to 1 decimal place
    const displayHeight = Math.round(this.height * 10) / 10;

    return html`
      <ha-card>
        <div class="card-inner">
          <div class="col-desk">
            ${this.renderDeskSVG()}
          </div>

          <div class="col-mid">
            <div class="card-title">${this.config.name || 'Office Desk'}</div>
            <div class="height-num" style="color: ${heightColor};">
              ${displayHeight}<span class="height-unit">cm</span>
            </div>
          </div>

          <div class="col-right">
            ${this.renderGauge()}
            ${this.renderButtons()}
          </div>
        </div>
      </ha-card>
    `;
  }

  renderPresets(): TemplateResult {
    const presets = this.config.presets || [];

    return html`
        <div class="presets">
          ${presets.map(item => html`
            <paper-button @click="${() => this.handlePreset(item.target)}">
              ${item.label} - ${item.target} cm
            </paper-button>`)}
        </div>
      `;
  }

  renderDeskSVG(): TemplateResult {
    const state = this.deskState;
    const stateClass = `state-${state}`;

    // Color scheme based on state
    let surfaceColor = '#60a5fa'; // sit blue
    let legColor = '#3b82f6';
    let surfaceOpacity = 0.85;
    let legOpacity = 0.35;
    let baseOpacity = 0.2;

    if (state === 'stand') {
      surfaceColor = '#4ade80'; // stand green
      legColor = '#22c55e';
    } else if (state === 'raising' || state === 'lowering') {
      surfaceColor = '#9ca3af'; // motion grey
      legColor = '#6b7280';
      surfaceOpacity = 0.7;
      legOpacity = 0.3;
      baseOpacity = 0.18;
    }

    return html`
      <svg class="desk-svg ${stateClass}" width="32" height="72" viewBox="0 0 32 72">
        <g class="desk-surface">
          <rect x="0" y="2" width="32" height="4" rx="1.5" fill="${surfaceColor}" opacity="${surfaceOpacity}"/>
        </g>
        <g class="desk-legs">
          <rect x="3" y="6" width="5" height="64" rx="2" fill="${legColor}" opacity="${legOpacity}"/>
          <rect x="24" y="6" width="5" height="64" rx="2" fill="${legColor}" opacity="${legOpacity}"/>
          <rect x="1" y="66" width="30" height="4" rx="1.5" fill="${legColor}" opacity="${baseOpacity}"/>
        </g>
      </svg>
    `;
  }

  renderGauge(): TemplateResult {
    const state = this.deskState;
    const gaugeHeight = `${this.alpha * 100}%`;

    let fillColor = 'var(--sit-color, #3b82f6)';
    if (state === 'stand') {
      fillColor = 'var(--stand-color, #22c55e)';
    } else if (state === 'raising' || state === 'lowering') {
      fillColor = 'var(--grey-fill, #374151)';
    }

    const animClass = (state === 'raising' || state === 'lowering') ? 'gauge-anim' : '';

    return html`
      <div class="gauge-track">
        <div class="gauge-fill ${animClass}" style="height: ${gaugeHeight}; background: ${fillColor};"></div>
      </div>
    `;
  }

  renderButtons(): TemplateResult {
    const state = this.deskState;
    const sitHeight = this.config.sit_height || 78;
    const standHeight = this.config.stand_height || 106;

    // Proximity checks: show motion label only when close to target
    const isRaisingToStand = state === 'raising' && this.height < (standHeight - 2);
    const isLoweringToSit = state === 'lowering' && this.height > (sitHeight + 2);
    const isMoving = state === 'raising' || state === 'lowering';

    // Button class logic
    const standBtnClass = state === 'stand' ? 'btn-active-stand'
      : isRaisingToStand ? 'btn-motion-raise btn-shimmer'
      : isMoving ? 'btn-idle-during-motion' : 'btn-ghost';

    const sitBtnClass = state === 'sit' ? 'btn-active-sit'
      : isLoweringToSit ? 'btn-motion-lower btn-shimmer'
      : isMoving ? 'btn-idle-during-motion' : 'btn-ghost';

    const standLabel = isRaisingToStand ? 'Raising' : 'Stand';
    const sitLabel = isLoweringToSit ? 'Lowering' : 'Sit';

    const standTextClass = isRaisingToStand ? 'btn-text-pulse' : '';
    const sitTextClass = isLoweringToSit ? 'btn-text-pulse' : '';

    return html`
      <div class="btn-stack">
        <button class="btn ${standBtnClass}"
                ?disabled=${isMoving}
                @click=${() => this.handlePreset(standHeight)}>
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,7 5,2 9,7"/>
          </svg>
          <span class="${standTextClass}">${standLabel}</span>
        </button>
        <button class="btn ${sitBtnClass}"
                ?disabled=${isMoving}
                @click=${() => this.handlePreset(sitHeight)}>
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,3 5,8 9,3"/>
          </svg>
          <span class="${sitTextClass}">${sitLabel}</span>
        </button>
      </div>
    `;
  }

  handlePreset(target: number): void {
    if (target > this.config.max_height) {
      return;
    }

    const travelDist = this.config.max_height - this.config.min_height;
    const positionInPercent = Math.round(((target - this.config.min_height) / travelDist) * 100);

    if (Number.isInteger(positionInPercent)) {
      this.callService('set_cover_position', { position: positionInPercent });
    }
  }

  private callService(service: string, options = {}): void {
    this.hass.callService('cover', service, {
      entity_id: this.config.desk,
      ...options
    });
  }

  static get styles(): CSSResult {
    return css`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');

      :host {
        --sit-color: #3b82f6;
        --sit-dim: rgba(59, 130, 246, 0.14);
        --sit-text: #93c5fd;
        --sit-border: rgba(59, 130, 246, 0.22);

        --stand-color: #22c55e;
        --stand-dim: rgba(34, 197, 94, 0.14);
        --stand-text: #86efac;
        --stand-border: rgba(34, 197, 94, 0.22);

        --grey-fill: #374151;
        --grey-dim: rgba(107, 114, 128, 0.1);
        --grey-text: #9ca3af;

        display: block;
        font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      }

      ha-card {
        padding: 14px;
        border-radius: 14px;
        background: var(--card-background-color, #1c2028);
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.07));
      }

      /* ── 3-column layout ──────────────────── */
      .card-inner {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        gap: 10px;
      }

      /* ── Desk illustration column ─────────── */
      .col-desk {
        flex-shrink: 0;
        width: 34px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .desk-svg {
        overflow: visible;
      }

      .desk-legs {
        transform-origin: 50% 100%;
      }

      /* ── Title + height column ───────────── */
      .col-mid {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-width: 0;
      }

      .card-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-text-color, #e2e6f0);
      }

      .height-num {
        font-size: 34px;
        font-weight: 300;
        letter-spacing: -1.5px;
        line-height: 1;
        margin-top: auto;
      }

      .height-unit {
        font-size: 13px;
        font-weight: 400;
        opacity: 0.45;
        margin-left: 1px;
      }

      /* ── Gauge + buttons column ──────────── */
      .col-right {
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        align-items: stretch;
        gap: 8px;
      }

      /* ── Gauge track ─────────────────────── */
      .gauge-track {
        width: 4px;
        background: var(--divider-color, rgba(255, 255, 255, 0.1));
        border-radius: 4px;
        position: relative;
        overflow: hidden;
        align-self: stretch;
      }

      .gauge-fill {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        border-radius: 4px;
        transition: height 0.3s ease, background 0.3s ease;
      }

      /* ── Button stack ────────────────────── */
      .btn-stack {
        display: flex;
        flex-direction: column;
        gap: 6px;
        justify-content: space-between;
      }

      .btn {
        border: none;
        border-radius: 8px;
        padding: 0 11px;
        height: 30px;
        font-family: 'DM Sans', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        white-space: nowrap;
        letter-spacing: 0.02em;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .btn svg {
        width: 10px;
        height: 10px;
        flex-shrink: 0;
      }

      .btn-active-sit {
        background: var(--sit-dim);
        color: var(--sit-text);
        border: 1px solid var(--sit-border);
      }

      .btn-active-stand {
        background: var(--stand-dim);
        color: var(--stand-text);
        border: 1px solid var(--stand-border);
      }

      .btn-ghost {
        background: var(--divider-color, rgba(255, 255, 255, 0.05));
        color: var(--secondary-text-color, #9ca3af);
        border: 1px solid transparent;
      }

      .btn-ghost:hover {
        background: var(--divider-color, rgba(255, 255, 255, 0.1));
      }

      .btn-motion-raise,
      .btn-motion-lower {
        background: var(--grey-dim);
        color: var(--grey-text);
        border: 1px solid rgba(107, 114, 128, 0.18);
        cursor: default;
      }

      .btn-idle-during-motion {
        background: var(--divider-color, rgba(255, 255, 255, 0.05));
        color: var(--secondary-text-color, #5c6478);
        border: 1px solid transparent;
        opacity: 0.3;
        cursor: not-allowed;
      }

      .btn:disabled {
        pointer-events: none;
      }

      /* ══════════════════════════════════════
         ANIMATIONS
      ══════════════════════════════════════ */

      /* Static states */
      .state-sit .desk-surface {
        transform: translateY(40px);
        transition: transform 0.3s ease;
      }

      .state-sit .desk-legs {
        transform: scaleY(0.35);
        transition: transform 0.3s ease;
      }

      .state-stand .desk-surface {
        transform: translateY(0px);
        transition: transform 0.3s ease;
      }

      .state-stand .desk-legs {
        transform: scaleY(1);
        transition: transform 0.3s ease;
      }

      /* Raising animation */
      @keyframes surface-raise {
        0% {
          transform: translateY(40px);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          transform: translateY(0px);
          animation-timing-function: steps(1, end);
        }
        82% {
          transform: translateY(0px);
        }
        82.01% {
          transform: translateY(40px);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          transform: translateY(40px);
        }
      }

      @keyframes legs-raise {
        0% {
          transform: scaleY(0.35);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          transform: scaleY(1);
          animation-timing-function: steps(1, end);
        }
        82% {
          transform: scaleY(1);
        }
        82.01% {
          transform: scaleY(0.35);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          transform: scaleY(0.35);
        }
      }

      @keyframes gauge-raise {
        0% {
          height: 27%;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          height: 78%;
          animation-timing-function: steps(1, end);
        }
        82% {
          height: 78%;
        }
        82.01% {
          height: 27%;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          height: 27%;
        }
      }

      /* Lowering animation */
      @keyframes surface-lower {
        0% {
          transform: translateY(0px);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          transform: translateY(40px);
          animation-timing-function: steps(1, end);
        }
        82% {
          transform: translateY(40px);
        }
        82.01% {
          transform: translateY(0px);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          transform: translateY(0px);
        }
      }

      @keyframes legs-lower {
        0% {
          transform: scaleY(1);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          transform: scaleY(0.35);
          animation-timing-function: steps(1, end);
        }
        82% {
          transform: scaleY(0.35);
        }
        82.01% {
          transform: scaleY(1);
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          transform: scaleY(1);
        }
      }

      @keyframes gauge-lower {
        0% {
          height: 78%;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        65% {
          height: 27%;
          animation-timing-function: steps(1, end);
        }
        82% {
          height: 27%;
        }
        82.01% {
          height: 78%;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        100% {
          height: 78%;
        }
      }

      .state-raising .desk-surface {
        animation: surface-raise 2.2s infinite;
      }

      .state-raising .desk-legs {
        animation: legs-raise 2.2s infinite;
      }

      .state-raising .gauge-anim {
        animation: gauge-raise 2.2s infinite;
      }

      .state-lowering .desk-surface {
        animation: surface-lower 2.2s infinite;
      }

      .state-lowering .desk-legs {
        animation: legs-lower 2.2s infinite;
      }

      .state-lowering .gauge-anim {
        animation: gauge-lower 2.2s infinite;
      }

      /* Shimmer effect for motion buttons */
      @keyframes shimmer-sweep {
        0% {
          transform: translateX(-100%);
        }
        60% {
          transform: translateX(100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      .btn-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          105deg,
          transparent 30%,
          rgba(255, 255, 255, 0.1) 50%,
          transparent 70%
        );
        animation: shimmer-sweep 1.8s ease-in-out infinite;
      }

      /* Text pulse for motion buttons */
      @keyframes text-pulse {
        0%, 100% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
      }

      .btn-text-pulse {
        animation: text-pulse 1.4s ease-in-out infinite;
      }
    `;
  }
}
