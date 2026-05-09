import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

/**
 * Header actions component that manages cart notifications.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} liveRegion - The live region for cart announcements.
 *
 * @extends {Component<Refs>}
 */
class HeaderActions extends Component {
  requiredRefs = ['liveRegion'];

  /** @type {Set<HTMLElement>} */
  #upsellRails = new Set();

  /** @type {MutationObserver | null} */
  #observer = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);
    this.addEventListener('click', this.#onUpsellNavClick);
    window.addEventListener('resize', this.#syncUpsellNavStates);

    this.#observer = new MutationObserver(this.#queueUpsellRailInit);
    this.#observer.observe(this, { childList: true, subtree: true });
    this.#queueUpsellRailInit();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);
    this.removeEventListener('click', this.#onUpsellNavClick);
    window.removeEventListener('resize', this.#syncUpsellNavStates);
    this.#observer?.disconnect();
    this.#observer = null;
    this.#upsellRails.forEach((rail) => rail.removeEventListener('scroll', this.#onUpsellRailScroll));
    this.#upsellRails.clear();
  }

  /**
   * Handles cart update events and announces the new count to screen readers.
   * @param {CustomEvent<{ resource?: { item_count?: number } }>} event
   */
  #onCartUpdate = (event) => {
    const cartCount = event.detail.resource?.item_count;
    if (cartCount === undefined) return;

    this.refs.liveRegion.textContent = `${Theme.translations.cart_count}: ${cartCount}`;
    this.#queueUpsellRailInit();
  };

  #queueUpsellRailInit = () => {
    window.requestAnimationFrame(() => {
      this.#initUpsellRails();
    });
  };

  #initUpsellRails() {
    const rails = Array.from(this.querySelectorAll('[data-upsell-rail]')).filter(
      (element) => element instanceof HTMLElement
    );
    const currentRails = new Set(rails);

    this.#upsellRails.forEach((rail) => {
      if (!currentRails.has(rail)) {
        rail.removeEventListener('scroll', this.#onUpsellRailScroll);
        this.#upsellRails.delete(rail);
      }
    });

    rails.forEach((rail) => {
      if (!this.#upsellRails.has(rail)) {
        rail.addEventListener('scroll', this.#onUpsellRailScroll, { passive: true });
        this.#upsellRails.add(rail);
      }

      this.#updateUpsellNavState(rail);
    });
  }

  /**
   * @param {Event} event
   */
  #onUpsellRailScroll = (event) => {
    const rail = event.currentTarget;
    if (!(rail instanceof HTMLElement)) return;
    this.#updateUpsellNavState(rail);
  };

  /**
   * @param {MouseEvent} event
   */
  #onUpsellNavClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-upsell-nav]') : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const railId = button.dataset.upsellRailId;
    if (!railId) return;

    const rail = this.querySelector(`[data-upsell-rail-id="${railId}"]`);
    if (!(rail instanceof HTMLElement)) return;

    const direction = button.dataset.upsellNav === 'next' ? 1 : -1;
    const scrollStep = Math.max(rail.clientWidth * 0.86, 220);

    rail.scrollBy({
      left: direction * scrollStep,
      behavior: 'smooth',
    });

    window.requestAnimationFrame(() => this.#updateUpsellNavState(rail));
  };

  #syncUpsellNavStates = () => {
    this.#upsellRails.forEach((rail) => this.#updateUpsellNavState(rail));
  };

  /**
   * @param {HTMLElement} rail
   */
  #updateUpsellNavState(rail) {
    const railId = rail.dataset.upsellRailId;
    if (!railId) return;

    const prevButton = this.querySelector(`[data-upsell-nav="prev"][data-upsell-rail-id="${railId}"]`);
    const nextButton = this.querySelector(`[data-upsell-nav="next"][data-upsell-rail-id="${railId}"]`);

    if (!(prevButton instanceof HTMLButtonElement) || !(nextButton instanceof HTMLButtonElement)) return;

    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const atStart = rail.scrollLeft <= 2;
    const atEnd = rail.scrollLeft >= maxScrollLeft - 2;

    prevButton.disabled = atStart;
    nextButton.disabled = atEnd;
  }
}

if (!customElements.get('header-actions')) {
  customElements.define('header-actions', HeaderActions);
}
