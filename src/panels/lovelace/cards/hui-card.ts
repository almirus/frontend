import { PropertyValues, ReactiveElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import { MediaQueriesListener } from "../../../common/dom/media_query";
import "../../../components/ha-svg-icon";
import { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../types";
import { computeCardSize } from "../common/compute-card-size";
import {
  attachConditionMediaQueriesListeners,
  checkConditionsMet,
} from "../common/validate-condition";
import { createCardElement } from "../create-element/create-card-element";
import { createErrorCardConfig } from "../create-element/create-element-base";
import type { LovelaceCard, LovelaceLayoutOptions } from "../types";

declare global {
  interface HASSDomEvents {
    "card-visibility-changed": { value: boolean };
    "card-updated": undefined;
  }
}

@customElement("hui-card")
export class HuiCard extends ReactiveElement {
  @property({ type: Boolean }) public preview = false;

  @property({ attribute: false }) public isPanel = false;

  @property({ attribute: false }) public config?: LovelaceCardConfig;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public layout?: string;

  private _elementConfig?: LovelaceCardConfig;

  public load() {
    if (!this.config) {
      throw new Error("Cannot build card without config");
    }
    this._loadElement(this.config);
  }

  private _element?: LovelaceCard;

  private _listeners: MediaQueriesListener[] = [];

  protected createRenderRoot() {
    return this;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._clearMediaQueries();
  }

  public connectedCallback() {
    super.connectedCallback();
    this._listenMediaQueries();
    this._updateVisibility();
  }

  public getCardSize(): number | Promise<number> {
    if (this._element) {
      const size = computeCardSize(this._element);
      return size;
    }
    return 1;
  }

  public getLayoutOptions(): LovelaceLayoutOptions {
    const configOptions = this.config?.layout_options ?? {};
    if (this._element) {
      const cardOptions = this._element.getLayoutOptions?.() ?? {};
      return {
        ...cardOptions,
        ...configOptions,
      };
    }
    return configOptions;
  }

  public getElementLayoutOptions(): LovelaceLayoutOptions {
    return this._element?.getLayoutOptions?.() ?? {};
  }

  private _updateElement(config: LovelaceCardConfig) {
    if (!this._element) {
      return;
    }
    this._element.setConfig(config);
    this._elementConfig = config;
    fireEvent(this, "card-updated");
  }

  private _loadElement(config: LovelaceCardConfig) {
    this._element = createCardElement(config);
    this._elementConfig = config;
    if (this.hass) {
      this._element.hass = this.hass;
    }
    this._element.layout = this.layout;
    this._element.preview = this.preview;
    // For backwards compatibility
    (this._element as any).editMode = this.preview;
    // Update element when the visibility of the card changes (e.g. conditional card or filter card)
    this._element.addEventListener("card-visibility-changed", (ev: Event) => {
      ev.stopPropagation();
      this._updateVisibility();
    });
    this._element.addEventListener(
      "ll-upgrade",
      (ev: Event) => {
        ev.stopPropagation();
        if (this.hass) {
          this._element!.hass = this.hass;
        }
        fireEvent(this, "card-updated");
      },
      { once: true }
    );
    this._element.addEventListener(
      "ll-rebuild",
      (ev: Event) => {
        ev.stopPropagation();
        this._loadElement(config);
        fireEvent(this, "card-updated");
      },
      { once: true }
    );
    while (this.lastChild) {
      this.removeChild(this.lastChild);
    }
    this._updateVisibility();
  }

  protected willUpdate(changedProps: PropertyValues<typeof this>): void {
    super.willUpdate(changedProps);

    if (!this._element) {
      this.load();
    }
  }

  protected update(changedProps: PropertyValues<typeof this>) {
    super.update(changedProps);

    if (this._element) {
      if (changedProps.has("config")) {
        const elementConfig = this._elementConfig;
        if (this.config !== elementConfig && this.config) {
          const typeChanged =
            this.config?.type !== elementConfig?.type || this.preview;
          // Rebuild the card if the type of the card has changed or if we are in preview mode
          if (typeChanged || this.preview) {
            this._loadElement(this.config);
          } else {
            this._updateElement(this.config);
          }
        }
      }
      if (changedProps.has("hass")) {
        try {
          if (this.hass) {
            this._element.hass = this.hass;
          }
        } catch (e: any) {
          this._loadElement(createErrorCardConfig(e.message, null));
        }
      }
      if (changedProps.has("preview")) {
        try {
          this._element.preview = this.preview;
          // For backwards compatibility
          (this._element as any).editMode = this.preview;
        } catch (e: any) {
          this._loadElement(createErrorCardConfig(e.message, null));
        }
      }
      if (changedProps.has("isPanel")) {
        this._element.isPanel = this.isPanel;
      }
      if (changedProps.has("layout")) {
        this._element.layout = this.layout;
      }
    }

    if (changedProps.has("hass") || changedProps.has("preview")) {
      this._updateVisibility();
    }
  }

  private _clearMediaQueries() {
    this._listeners.forEach((unsub) => unsub());
    this._listeners = [];
  }

  private _listenMediaQueries() {
    this._clearMediaQueries();
    if (!this.config?.visibility) {
      return;
    }
    const conditions = this.config.visibility;
    const hasOnlyMediaQuery =
      conditions.length === 1 &&
      conditions[0].condition === "screen" &&
      !!conditions[0].media_query;

    this._listeners = attachConditionMediaQueriesListeners(
      this.config.visibility,
      (matches) => {
        this._updateVisibility(hasOnlyMediaQuery && matches);
      }
    );
  }

  private _updateVisibility(forceVisible?: boolean) {
    if (!this._element || !this.hass) {
      return;
    }

    if (this._element.hidden) {
      this._setElementVisibility(false);
      return;
    }

    const visible =
      forceVisible ||
      this.preview ||
      !this.config?.visibility ||
      checkConditionsMet(this.config.visibility, this.hass);
    this._setElementVisibility(visible);
  }

  private _setElementVisibility(visible: boolean) {
    if (!this._element) return;

    if (this.hidden !== !visible) {
      this.style.setProperty("display", visible ? "" : "none");
      this.toggleAttribute("hidden", !visible);
      fireEvent(this, "card-visibility-changed", { value: visible });
    }

    if (!visible && this._element.parentElement) {
      this.removeChild(this._element);
    } else if (visible && !this._element.parentElement) {
      this.appendChild(this._element);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card": HuiCard;
  }
}
