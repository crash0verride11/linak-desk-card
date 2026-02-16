import {
  LitElement,
  html,
  css,
  PropertyValues,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { CSSResult, TemplateResult } from 'lit';
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

  public static getGridOptions() {
    return {
      rows: 2,
      columns: 12,
      min_rows: 2,
    };
  }

  private static getDefaultsForUnit(unit: string): { min_height: number; max_height: number; sit_height: number; stand_height: number } {
    if (unit === 'in') {
      return {
        min_height: 24.75,
        max_height: 50,
        sit_height: 30.8,
        stand_height: 42.5
      };
    }
    // Default to cm
    return {
      min_height: 63,
      max_height: 127,
      sit_height: 78,
      stand_height: 108
    };
  }

  public static getStubConfig(hass: HomeAssistant, entities: string[]): Partial<LinakDeskCardConfig> {
      const [desk] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'cover' && eid.includes('desk'));
      const [height_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'sensor' && eid.includes('desk_height'));
      const [moving_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'binary_sensor' && eid.includes('desk_moving'));
      const [connection_sensor] = entities.filter((eid) => eid.substr(0, eid.indexOf('.')) === 'binary_sensor' && eid.includes('desk_connection'));

    // Detect unit from height sensor
    const unit = hass.states[height_sensor]?.attributes?.unit_of_measurement || 'cm';
    const defaults = this.getDefaultsForUnit(unit);

    return {
      desk,
      height_sensor,
      moving_sensor,
      connection_sensor,
      min_height: defaults.min_height,
      max_height: defaults.max_height,
      sit_height: defaults.sit_height,
      stand_height: defaults.stand_height,
      presets: []
    };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private config!: LinakDeskCardConfig;
  private _previousHeight: number | null = null;
  private _motionDirection: 'raising' | 'lowering' | null = null;
  private _motionTimeout: number | null = null;
  @state() private _clickAnimating: Set<string> = new Set();

  public setConfig(config: LinakDeskCardConfig): void {
    if (!config.desk || !config.height_sensor) {
      throw new Error(localize('common.desk_and_height_required'));
    }

    this.config = config;
  }

  get desk(): HassEntity {
    return this.hass.states[this.config.desk];
  }

  get cardTitle(): string {
    // Use configured name, or fall back to desk entity's friendly name, or entity ID
    return this.config.name ||
           this.desk?.attributes?.friendly_name ||
           this.config.desk;
  }

  get height(): number {
    // Height sensor reports absolute height in cm
    return parseFloat(this.hass.states[this.config.height_sensor]?.state) || 0;
  }

  get heightUnit(): string {
    // Get unit from height sensor, default to 'cm' if not available
    return this.hass.states[this.config.height_sensor]?.attributes?.unit_of_measurement || 'cm';
  }

  get minHeight(): number {
    return this.config.min_height ?? LinakDeskCard.getDefaultsForUnit(this.heightUnit).min_height;
  }

  get maxHeight(): number {
    return this.config.max_height ?? LinakDeskCard.getDefaultsForUnit(this.heightUnit).max_height;
  }

  get sitHeightDefault(): number {
    return this.heightUnit === 'in' ? 30.8 : 78;
  }

  get standHeightDefault(): number {
    return this.heightUnit === 'in' ? 42.5 : 108;
  }

  get relativeHeight(): number {
    // Calculate relative height (offset from minimum)
    return this.height - this.minHeight;
  }

  get connected(): boolean {
    if (!this.config.connection_sensor) {
      return true; // Assume connected if sensor not configured
    }
    return this.hass.states[this.config.connection_sensor]?.state === 'on';
  }

  get moving(): boolean {
    if (!this.config.moving_sensor) {
      return false; // Motion is detected from height changes
    }
    return this.hass.states[this.config.moving_sensor]?.state === 'on';
  }

  get alpha(): number {
    // Percentage of desk range (0 to 1)
    return this.relativeHeight / (this.maxHeight - this.minHeight);
  }

  get deskState(): DeskState {
    const sitHeight = this.config.sit_height ?? this.sitHeightDefault;
    const standHeight = this.config.stand_height ?? this.standHeightDefault;

    // First priority: use detected motion from height changes
    if (this._motionDirection) {
      // Smart override: if we've reached target height, switch to static state
      if (this._motionDirection === 'raising' && this.height >= standHeight - 0.5) {
        return 'stand';
      }
      if (this._motionDirection === 'lowering' && this.height <= sitHeight + 0.5) {
        return 'sit';
      }
      return this._motionDirection;
    }

    // Second priority: fallback to moving_sensor if configured
    if (this.config.moving_sensor && this.moving) {
      const midpoint = (sitHeight + standHeight) / 2;
      // Determine direction based on whether we're above or below midpoint
      return this.height >= midpoint ? 'lowering' : 'raising';
    }

    // Static state - use proximity zones
    if (this.height >= standHeight - 1) {
      return 'stand';
    }
    if (this.height <= sitHeight + 1) {
      return 'sit';
    }

    // Fallback for positions between sit and stand zones (use midpoint)
    const midpoint = (sitHeight + standHeight) / 2;
    return this.height < midpoint ? 'sit' : 'stand';
  }

  get isInClearSitZone(): boolean {
    const sitHeight = this.config.sit_height ?? this.sitHeightDefault;
    return this.height <= sitHeight + 1;
  }

  get isInClearStandZone(): boolean {
    const standHeight = this.config.stand_height ?? this.standHeightDefault;
    return this.height >= standHeight - 1;
  }

  get sitColor(): string {
    return this.config.sit_color ?? 'blue';
  }

  get standColor(): string {
    return this.config.stand_color ?? 'green';
  }

  private static readonly THEME_COLORS = new Set([
    'primary', 'accent', 'red', 'pink', 'purple', 'deep-purple', 'indigo',
    'blue', 'light-blue', 'cyan', 'teal', 'green', 'light-green', 'lime',
    'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'light-grey',
    'grey', 'dark-grey', 'blue-grey', 'black', 'white',
  ]);

  private computeCssColor(color: string): string {
    if (LinakDeskCard.THEME_COLORS.has(color)) {
      return `var(--${color}-color)`;
    }
    return color;
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
        || (this.config?.connection_sensor ? newHass.states[this.config.connection_sensor]?.state !== this.hass?.states[this.config.connection_sensor]?.state : false)
        || newHass.states[this.config?.height_sensor]?.state !== this.hass?.states[this.config?.height_sensor]?.state
        || (this.config?.moving_sensor ? newHass.states[this.config.moving_sensor]?.state !== this.hass?.states[this.config.moving_sensor]?.state : false)
      );
    }
    return true;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (changedProps.has('hass') && this.config?.height_sensor) {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      const oldHeight = oldHass ? parseFloat(oldHass.states[this.config.height_sensor]?.state) || 0 : null;
      const currentHeight = this.height;

      // Detect motion based on height change (threshold: 0.1 units to filter noise)
      if (oldHeight !== null && Math.abs(currentHeight - oldHeight) > 0.1) {
        const delta = currentHeight - oldHeight;
        this._motionDirection = delta > 0 ? 'raising' : 'lowering';

        // Clear any existing timeout
        if (this._motionTimeout !== null) {
          window.clearTimeout(this._motionTimeout);
        }

        // Clear motion state after 1.5 seconds of no height changes
        this._motionTimeout = window.setTimeout(() => {
          this._motionDirection = null;
          this.requestUpdate();
        }, 2000);
      }
    }
  }

  protected render(): TemplateResult | void {
    const state = this.deskState;
    const sitCss = this.computeCssColor(this.sitColor);
    const standCss = this.computeCssColor(this.standColor);
    const isMoving = state === 'raising' || state === 'lowering';
    const stateColor = isMoving ? 'var(--grey-text, #9ca3af)' :
                       state === 'stand' ? 'var(--stand-color)' : 'var(--sit-color)';

    const colorVars = `
      --sit-color: ${sitCss};
      --sit-dim: color-mix(in srgb, ${sitCss} 14%, transparent);
      --sit-text: ${sitCss};
      --sit-border: color-mix(in srgb, ${sitCss} 22%, transparent);
      --stand-color: ${standCss};
      --stand-dim: color-mix(in srgb, ${standCss} 14%, transparent);
      --stand-text: ${standCss};
      --stand-border: color-mix(in srgb, ${standCss} 22%, transparent);
      --state-color: ${stateColor};
    `;

    // Round height to 1 decimal place
    const displayHeight = Math.round(this.height * 10) / 10;

    return html`
      <ha-card style="${colorVars}">
        <div class="card-inner">
          <div class="col-left">
            ${!this.config.hide_title ? html`<div class="card-title" @click=${() => this._showMoreInfo(this.config.desk)}>${this.cardTitle}</div>` : ''}
            <div class="desk-row">
              <div class="col-desk">
                ${this.renderDeskSVG(state)}
              </div>
              <div class="height-num" style="color: ${stateColor};" @click=${() => this._showMoreInfo(this.config.height_sensor)}>
                ${displayHeight}<span class="height-unit">${this.heightUnit}</span>
              </div>
            </div>
          </div>

          <div class="col-right">
            ${this.renderGauge(state)}
            ${this.renderButtons(state)}
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

  renderDeskSVG(state: DeskState): TemplateResult {
    const stateClass = `state-${state}`;
    const isMoving = state === 'raising' || state === 'lowering';
    const color = 'var(--state-color)';
    const surfaceOpacity = isMoving ? 0.7 : 1.0;
    const legOpacity = isMoving ? 0.3 : 0.4;
    const baseOpacity = isMoving ? 0.4 : 0.6;

    return html`
      <svg class="desk-svg ${stateClass}" width="60" height="55" viewBox="0 0 60 48">
        <g class="desk-surface">
          <rect x="0" y="0" width="60" height="4" rx="1.5" fill="${color}" opacity="${surfaceOpacity}"/>
        </g>
        <g class="desk-legs">
          <rect x="3" y="6" width="4" height="40" fill="${color}" opacity="${legOpacity}"/>
          <rect x="53" y="6" width="4" height="40" fill="${color}" opacity="${legOpacity}"/>
        </g>
        <g class="desk-base">
          <rect x="1" y="46" width="8" height="2" rx="1" fill="${color}" opacity="${baseOpacity}"/>
        </g>
        <g class="desk-base">
          <rect x="51" y="46" width="8" height="2" rx="1" fill="${color}" opacity="${baseOpacity}"/>
        </g>
      </svg>
    `;
  }

  renderGauge(state: DeskState): TemplateResult {
    const gaugeHeight = `${this.alpha * 100}%`;
    const isMoving = state === 'raising' || state === 'lowering';
    const fillColor = isMoving ? 'var(--grey-fill, #374151)' : 'var(--state-color)';
    const animClass = isMoving ? 'gauge-anim' : '';

    return html`
      <div class="gauge-track">
        <div class="gauge-fill ${animClass}" style="height: ${gaugeHeight}; background: ${fillColor};"></div>
      </div>
    `;
  }

  renderButtons(state: DeskState): TemplateResult {
    const sitHeight = this.config.sit_height ?? this.sitHeightDefault;
    const standHeight = this.config.stand_height ?? this.standHeightDefault;
    const midpoint = (sitHeight + standHeight) / 2;

    // Proximity checks: show motion label only when close to target
    const isRaisingToStand = state === 'raising' && this.height < (standHeight - 1);
    const isLoweringToSit = state === 'lowering' && this.height > (sitHeight + 1);
    const isMoving = state === 'raising' || state === 'lowering';

    // Determine which side of midpoint we're on (when not in motion)
    const isAboveMidpoint = this.height >= midpoint;
    const isBelowMidpoint = this.height < midpoint;

    // Stand button class logic
    let standBtnClass: string;
    if (isRaisingToStand) {
      standBtnClass = 'btn-motion-raise btn-shimmer';
    } else if (isMoving) {
      standBtnClass = 'btn-idle-during-motion';
    } else if (this.isInClearStandZone && state === 'stand') {
      standBtnClass = 'btn-active-stand'; // Green fill, white text
    } else if (!this.isInClearSitZone && !this.isInClearStandZone && isAboveMidpoint) {
      standBtnClass = 'btn-outline-stand'; // Green outline, green text
    } else {
      standBtnClass = 'btn-outline-grey'; // Grey outline, grey text
    }

    // Sit button class logic
    let sitBtnClass: string;
    if (isLoweringToSit) {
      sitBtnClass = 'btn-motion-lower btn-shimmer';
    } else if (isMoving) {
      sitBtnClass = 'btn-idle-during-motion';
    } else if (this.isInClearSitZone && state === 'sit') {
      sitBtnClass = 'btn-active-sit'; // Blue fill, white text
    } else if (!this.isInClearSitZone && !this.isInClearStandZone && isBelowMidpoint) {
      sitBtnClass = 'btn-outline-sit'; // Blue outline, blue text
    } else {
      sitBtnClass = 'btn-outline-grey'; // Grey outline, grey text
    }

    const standLabel = isRaisingToStand ? 'Raising' : 'Stand';
    const sitLabel = isLoweringToSit ? 'Lowering' : 'Sit';

    const standTextClass = isRaisingToStand ? 'btn-text-pulse' : '';
    const sitTextClass = isLoweringToSit ? 'btn-text-pulse' : '';

    // Add click animation class if button is being clicked
    const standClickClass = this._clickAnimating.has('stand') ? 'btn-click' : '';
    const sitClickClass = this._clickAnimating.has('sit') ? 'btn-click' : '';

    const standIcon = standBtnClass === 'btn-active-stand'
      ? html`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="currentColor"/></svg>`
      : html`<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,7 5,2 9,7"/></svg>`;

    const sitIcon = sitBtnClass === 'btn-active-sit'
      ? html`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="currentColor"/></svg>`
      : html`<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 5,8 9,3"/></svg>`;

    return html`
      <div class="btn-stack">
        <button class="btn ${standBtnClass} ${standClickClass}"
                @click=${() => this.handlePreset(standHeight, 'stand')}>
          ${standIcon}
          <span class="${standTextClass}">${standLabel}</span>
        </button>
        <button class="btn ${sitBtnClass} ${sitClickClass}"
                @click=${() => this.handlePreset(sitHeight, 'sit')}>
          ${sitIcon}
          <span class="${sitTextClass}">${sitLabel}</span>
        </button>
      </div>
    `;
  }

  handlePreset(target: number, buttonId?: string): void {
    if (target > this.maxHeight) {
      return;
    }

    // Trigger click animation if buttonId provided
    if (buttonId) {
      this._clickAnimating.add(buttonId);
      this.requestUpdate();

      // Remove animation class after animation completes (600ms duration)
      setTimeout(() => {
        this._clickAnimating.delete(buttonId);
        this.requestUpdate();
      }, 600);
    }

    const travelDist = this.maxHeight - this.minHeight;
    const positionInPercent = Math.round(((target - this.minHeight) / travelDist) * 100);

    if (Number.isInteger(positionInPercent)) {
      this.callService('set_cover_position', { position: positionInPercent });
    }
  }

  private _showMoreInfo(entityId: string): void {
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  private callService(service: string, options = {}): void {
    this.hass.callService('cover', service, {
      entity_id: this.config.desk,
      ...options
    });
  }

  static get styles(): CSSResult {
    return css`
      :host {
        --sit-color: rgb(59, 130, 246);
        --sit-dim: rgba(59, 130, 246, 0.14);
        --sit-text: rgb(59, 130, 246);
        --sit-border: rgba(59, 130, 246, 0.22);

        --stand-color: rgb(119, 187, 65);
        --stand-dim: rgba(119, 187, 65, 0.14);
        --stand-text: rgb(119, 187, 65);
        --stand-border: rgba(119, 187, 65, 0.22);

        --grey-fill: #374151;
        --grey-dim: rgba(107, 114, 128, 0.1);
        --grey-text: #9ca3af;

        display: block;
      }

      ha-card {
        position: relative;
        overflow: hidden;
        padding: 14px;
        border-radius: 14px;
        background: var(--card-background-color, #1c2028);
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.07));
      }

      ha-card::after {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--state-color);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease-in-out;
        border-radius: inherit;
      }

      ha-card:hover::after {
        opacity: 0.02;
      }

      /* ── 2-column layout ──────────────────── */
      .card-inner {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        gap: 32px;
      }

      /* ── Left column: title top, desk+number bottom ─────────── */
      .col-left {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-width: 0;
      }

      .card-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color, #e2e6f0);
        line-height: 1;
        cursor: pointer;
      }

      /* Desk icon + number side by side at bottom */
      .desk-row {
        display: flex;
        flex-direction: row;
        align-items: flex-end;
        gap: 8px;
      }

      .col-desk {
        flex-shrink: 0;
        width: 60px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .desk-svg {
        overflow: visible;
      }

      .desk-legs {
        transform-origin: 50% calc(100% - 2px);
      }

      .height-num {
        font-size: 32px;
        font-weight: 400;
        letter-spacing: -1.5px;
        line-height: 1;
        cursor: pointer;
      }

      .height-unit {
        font-size: 14px;
        font-weight: 400;
        letter-spacing: -0.2px;
        opacity: 0.75;
        margin-left: 4px;
      }

      /* ── Gauge + buttons column ──────────── */
      .col-right {
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        align-items: stretch;
        padding: 4px 0px;
        gap: 12px;
      }

      /* ── Gauge track ─────────────────────── */
      .gauge-track {
        width: 8px;
        background: var(--divider-color, rgba(255, 255, 255, 0.1));
        border-radius: 5px;
        position: relative;
        overflow: hidden;
        align-self: stretch;
      }

      .gauge-fill {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        border-radius: 7px;
        transition: height 0.3s ease, background 0.3s ease;
      }

      /* ── Button stack ────────────────────── */
      .btn-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
        justify-content: space-between;
      }

      .btn {
        border: none;
        border-radius: 12px;
        padding: 0 14px;
        width: 100%;
        height: 36px;
        min-width: 120px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: grid;
        grid-template-columns: 1fr 2fr;
        align-items: center;
        white-space: nowrap;
        letter-spacing: 0.02em;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .btn svg {
        width: 12px;
        height: 12px;
        justify-self: end;
        margin-right: 12px;
      }

      .btn span {
        justify-self: center;
      }

      .btn-active-sit {
        background: var(--sit-color, rgb(59, 130, 246));
        color: white;
        border: 1px solid var(--sit-color, rgb(59, 130, 246));
      }

      .btn-active-stand {
        background: var(--stand-color, rgb(119, 187, 65));
        color: white;
        border: 1px solid var(--stand-color, rgb());
      }

      .btn-outline-sit {
        background: var(--sit-dim, rgba(59, 130, 246, 0.14));
        color: var(--sit-text, #93c5fd);
        border: 1px solid var(--sit-border, rgba(59, 130, 246, 0.22));
      }

      .btn-outline-stand {
        background: var(--stand-dim, rgba(119, 187, 65, 0.14));
        color: var(--stand-text, #86efac);
        border: 1px solid var(--stand-border, rgba(119, 187, 65, 0.22));
      }

      .btn-outline-grey {
        background: var(--grey-dim, rgba(107, 114, 128, 0.1));
        color: var(--grey-text, #9ca3af);
        border: 1px solid rgba(107, 114, 128, 0.18);
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
        transform: translateY(20px);
        transition: transform 0.3s ease;
      }

      .state-sit .desk-legs {
        transform: scaleY(0.5);
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
          transform: translateY(20px);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        62% {
          transform: translateY(0px);
          animation-timing-function: steps(1, end);
        }
        80% {
          transform: translateY(0px);
        }
        80.01% {
          transform: translateY(20px);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        100% {
          transform: translateY(20px);
        }
      }

      @keyframes legs-raise {
        0% {
          transform: scaleY(0.5);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        62% {
          transform: scaleY(1);
          animation-timing-function: steps(1, end);
        }
        80% {
          transform: scaleY(1);
        }
        80.01% {
          transform: scaleY(0.5);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        100% {
          transform: scaleY(0.5);
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
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        62% {
          transform: translateY(20px);
          animation-timing-function: steps(1, end);
        }
        80% {
          transform: translateY(20px);
        }
        80.01% {
          transform: translateY(0px);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        100% {
          transform: translateY(0px);
        }
      }

      @keyframes legs-lower {
        0% {
          transform: scaleY(1);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
        }
        62% {
          transform: scaleY(0.5);
          animation-timing-function: steps(1, end);
        }
        80% {
          transform: scaleY(0.5);
        }
        80.01% {
          transform: scaleY(1);
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
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

      /* Click effect (one-time glassy wipe) */
      @keyframes click-sweep {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      .btn-click::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          105deg,
          transparent 30%,
          rgba(255, 255, 255, 0.15) 50%,
          transparent 70%
        );
        animation: click-sweep 0.6s ease-out;
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
