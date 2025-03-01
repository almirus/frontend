import { mdiExclamationThick, mdiHelp } from "@mdi/js";
import { HassEntity } from "home-assistant-js-websocket";
import { CSSResultGroup, LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeCssColor } from "../../../common/color/compute-color";
import { hsv2rgb, rgb2hex, rgb2hsv } from "../../../common/color/convert-color";
import { DOMAINS_TOGGLE } from "../../../common/const";
import { computeDomain } from "../../../common/entity/compute_domain";
import { stateActive } from "../../../common/entity/state_active";
import { stateColorCss } from "../../../common/entity/state_color";
import "../../../components/ha-card";
import "../../../components/ha-ripple";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import "../../../components/tile/ha-tile-badge";
import "../../../components/tile/ha-tile-icon";
import "../../../components/tile/ha-tile-image";
import type { TileImageStyle } from "../../../components/tile/ha-tile-image";
import "../../../components/tile/ha-tile-info";
import { cameraUrlWithWidthHeight } from "../../../data/camera";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import "../../../state-display/state-display";
import { HomeAssistant } from "../../../types";
import "../card-features/hui-card-features";
import { actionHandler } from "../common/directives/action-handler-directive";
import { findEntities } from "../common/find-entities";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import type {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceLayoutOptions,
} from "../types";
import { renderTileBadge } from "./tile/badges/tile-badge";
import type { ThermostatCardConfig, TileCardConfig } from "./types";

export const getEntityDefaultTileIconAction = (entityId: string) => {
  const domain = computeDomain(entityId);
  const supportsIconAction =
    DOMAINS_TOGGLE.has(domain) ||
    ["button", "input_button", "scene"].includes(domain);

  return supportsIconAction ? "toggle" : "more-info";
};

const DOMAIN_IMAGE_STYLE: Record<string, TileImageStyle> = {
  update: "square",
  media_player: "rounded-square",
};

@customElement("hui-tile-card")
export class HuiTileCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-tile-card-editor");
    return document.createElement("hui-tile-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): TileCardConfig {
    const includeDomains = ["sensor", "light", "switch"];
    const maxEntities = 1;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFallback,
      includeDomains
    );

    return {
      type: "tile",
      entity: foundEntities[0] || "",
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TileCardConfig;

  public setConfig(config: ThermostatCardConfig): void {
    if (!config.entity) {
      throw new Error("Specify an entity");
    }

    this._config = {
      tap_action: {
        action: "more-info",
      },
      icon_tap_action: {
        action: getEntityDefaultTileIconAction(config.entity),
      },
      ...config,
    };
  }

  public getCardSize(): number {
    return (
      1 +
      (this._config?.vertical ? 1 : 0) +
      (this._config?.features?.length || 0)
    );
  }

  public getLayoutOptions(): LovelaceLayoutOptions {
    const grid_columns = 2;
    let grid_min_columns = 2;
    let grid_rows = 1;
    if (this._config?.features?.length) {
      grid_rows += this._config.features.length;
    }
    if (this._config?.vertical) {
      grid_rows++;
      grid_min_columns = 1;
    }
    return {
      grid_columns,
      grid_rows,
      grid_min_rows: grid_rows,
      grid_min_columns,
    };
  }

  private _handleAction(ev: ActionHandlerEvent) {
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  private _handleIconAction(ev: CustomEvent) {
    ev.stopPropagation();
    const config = {
      entity: this._config!.entity,
      tap_action: this._config!.icon_tap_action,
    };
    handleAction(this, this.hass!, config, "tap");
  }

  private _getImageUrl(entity: HassEntity): string | undefined {
    const entityPicture =
      entity.attributes.entity_picture_local ||
      entity.attributes.entity_picture;

    if (!entityPicture) return undefined;

    let imageUrl = this.hass!.hassUrl(entityPicture);
    if (computeDomain(entity.entity_id) === "camera") {
      imageUrl = cameraUrlWithWidthHeight(imageUrl, 80, 80);
    }

    return imageUrl;
  }

  private _computeStateColor = memoizeOne(
    (entity: HassEntity, color?: string) => {
      // Use custom color if active
      if (color) {
        return stateActive(entity) ? computeCssColor(color) : undefined;
      }

      // Use default color for person/device_tracker because color is on the badge
      if (
        computeDomain(entity.entity_id) === "person" ||
        computeDomain(entity.entity_id) === "device_tracker"
      ) {
        return undefined;
      }

      // Use light color if the light support rgb
      if (
        computeDomain(entity.entity_id) === "light" &&
        entity.attributes.rgb_color
      ) {
        const hsvColor = rgb2hsv(entity.attributes.rgb_color);

        // Modify the real rgb color for better contrast
        if (hsvColor[1] < 0.4) {
          // Special case for very light color (e.g: white)
          if (hsvColor[1] < 0.1) {
            hsvColor[2] = 225;
          } else {
            hsvColor[1] = 0.4;
          }
        }
        return rgb2hex(hsv2rgb(hsvColor));
      }

      // Fallback to state color
      return stateColorCss(entity);
    }
  );

  get hasCardAction() {
    return (
      !this._config?.tap_action ||
      hasAction(this._config?.tap_action) ||
      hasAction(this._config?.hold_action) ||
      hasAction(this._config?.double_tap_action)
    );
  }

  get hasIconAction() {
    return (
      !this._config?.icon_tap_action || hasAction(this._config?.icon_tap_action)
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const entityId = this._config.entity;
    const stateObj = entityId ? this.hass.states[entityId] : undefined;

    const contentClasses = { vertical: Boolean(this._config.vertical) };

    if (!stateObj) {
      return html`
        <ha-card>
          <div class="content ${classMap(contentClasses)}">
            <div class="icon-container">
              <ha-tile-icon>
                <ha-svg-icon .path=${mdiHelp}></ha-svg-icon>
              </ha-tile-icon>
              <ha-tile-badge class="not-found">
                <ha-svg-icon .path=${mdiExclamationThick}></ha-svg-icon>
              </ha-tile-badge>
            </div>
            <ha-tile-info
              .primary=${entityId}
              secondary=${this.hass.localize("ui.card.tile.not_found")}
            ></ha-tile-info>
          </div>
        </ha-card>
      `;
    }

    const name = this._config.name || stateObj.attributes.friendly_name;
    const active = stateActive(stateObj);
    const color = this._computeStateColor(stateObj, this._config.color);
    const domain = computeDomain(stateObj.entity_id);

    const localizedState = this._config.hide_state
      ? nothing
      : html`
          <state-display
            .stateObj=${stateObj}
            .hass=${this.hass}
            .content=${this._config.state_content}
          >
          </state-display>
        `;

    const style = {
      "--tile-color": color,
    };

    const imageUrl = this._config.show_entity_picture
      ? this._getImageUrl(stateObj)
      : undefined;

    return html`
      <ha-card style=${styleMap(style)} class=${classMap({ active })}>
        <div
          class="background"
          @action=${this._handleAction}
          .actionHandler=${actionHandler({
            hasHold: hasAction(this._config!.hold_action),
            hasDoubleClick: hasAction(this._config!.double_tap_action),
          })}
          role=${ifDefined(this.hasCardAction ? "button" : undefined)}
          tabindex=${ifDefined(this.hasCardAction ? "0" : undefined)}
          aria-labelledby="info"
        >
          <ha-ripple .disabled=${!this.hasCardAction}></ha-ripple>
        </div>
        <div class="container">
          <div class="content ${classMap(contentClasses)}">
            <div
              class="icon-container"
              role=${ifDefined(this.hasIconAction ? "button" : undefined)}
              tabindex=${ifDefined(this.hasIconAction ? "0" : undefined)}
              @action=${this._handleIconAction}
              .actionHandler=${actionHandler()}
            >
              ${imageUrl
                ? html`
                    <ha-tile-image
                      .imageStyle=${DOMAIN_IMAGE_STYLE[domain] || "circle"}
                      .imageUrl=${imageUrl}
                    ></ha-tile-image>
                  `
                : html`
                    <ha-tile-icon
                      data-domain=${ifDefined(domain)}
                      data-state=${ifDefined(stateObj?.state)}
                    >
                      <ha-state-icon
                        .icon=${this._config.icon}
                        .stateObj=${stateObj}
                        .hass=${this.hass}
                      ></ha-state-icon>
                    </ha-tile-icon>
                  `}
              ${renderTileBadge(stateObj, this.hass)}
            </div>
            <ha-tile-info
              id="info"
              .primary=${name}
              .secondary=${localizedState}
            ></ha-tile-info>
          </div>
          ${this._config.features
            ? html`
                <hui-card-features
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                  .color=${this._config.color}
                  .features=${this._config.features}
                ></hui-card-features>
              `
            : nothing}
        </div>
      </ha-card>
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        --tile-color: var(--state-inactive-color);
        -webkit-tap-highlight-color: transparent;
      }
      ha-card:has(.background:focus-visible) {
        --shadow-default: var(--ha-card-box-shadow, 0 0 0 0 transparent);
        --shadow-focus: 0 0 0 1px var(--tile-color);
        border-color: var(--tile-color);
        box-shadow: var(--shadow-default), var(--shadow-focus);
      }
      ha-card {
        --ha-ripple-color: var(--tile-color);
        --ha-ripple-hover-opacity: 0.04;
        --ha-ripple-pressed-opacity: 0.12;
        height: 100%;
        transition:
          box-shadow 180ms ease-in-out,
          border-color 180ms ease-in-out;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      ha-card.active {
        --tile-color: var(--state-icon-color);
      }
      [role="button"] {
        cursor: pointer;
      }
      [role="button"]:focus {
        outline: none;
      }
      .background {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        border-radius: var(--ha-card-border-radius, 12px);
        margin: calc(-1 * var(--ha-card-border-width, 1px));
        overflow: hidden;
      }
      .container {
        margin: calc(-1 * var(--ha-card-border-width, 1px));
        display: flex;
        flex-direction: column;
        flex: 1;
      }
      .content {
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 0 10px;
        min-height: var(--row-height, 56px);
        flex: 1;
        pointer-events: none;
      }
      .vertical {
        flex-direction: column;
        text-align: center;
        justify-content: center;
      }
      .vertical .icon-container {
        margin-bottom: 10px;
        margin-right: 0;
        margin-inline-start: initial;
        margin-inline-end: initial;
      }
      .vertical ha-tile-info {
        width: 100%;
        flex: none;
      }
      .icon-container {
        position: relative;
        flex: none;
        margin-right: 10px;
        margin-inline-start: initial;
        margin-inline-end: 10px;
        direction: var(--direction);
        transition: transform 180ms ease-in-out;
      }
      .icon-container ha-tile-icon,
      .icon-container ha-tile-image {
        --tile-icon-color: var(--tile-color);
        user-select: none;
        -ms-user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
      }
      .icon-container ha-tile-badge {
        position: absolute;
        top: -3px;
        right: -3px;
        inset-inline-end: -3px;
        inset-inline-start: initial;
      }
      .icon-container[role="button"] {
        pointer-events: auto;
      }
      .icon-container[role="button"]:focus-visible,
      .icon-container[role="button"]:active {
        transform: scale(1.2);
      }
      ha-tile-info {
        position: relative;
        min-width: 0;
        transition: background-color 180ms ease-in-out;
        box-sizing: border-box;
      }
      hui-card-features {
        --feature-color: var(--tile-color);
      }

      ha-tile-icon[data-domain="alarm_control_panel"][data-state="pending"],
      ha-tile-icon[data-domain="alarm_control_panel"][data-state="arming"],
      ha-tile-icon[data-domain="alarm_control_panel"][data-state="triggered"],
      ha-tile-icon[data-domain="lock"][data-state="jammed"] {
        animation: pulse 1s infinite;
      }

      ha-tile-badge.not-found {
        --tile-badge-background-color: var(--red-color);
      }

      @keyframes pulse {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tile-card": HuiTileCard;
  }
}
