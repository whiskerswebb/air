import { DialogComponent, DialogOpenEvent, DialogCloseEvent } from '@theme/dialog';
import { CartAddEvent, ThemeEvents } from '@theme/events';
import { isMobileBreakpoint } from '@theme/utilities';

/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 * @property {HTMLElement} [liveRegion] - The live region for cart announcements when dialog is open.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {number} */
  #summaryThreshold = 0.5;

  /** @type {AbortController | null} */
  #historyAbortController = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.addEventListener(DialogOpenEvent.eventName, this.#syncUpsellNavStates);
    this.addEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.addEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);
    this.addEventListener('click', this.#onUpsellNavClick);
    this.addEventListener('scroll', this.#onUpsellRailScroll, true);
    this.addEventListener('submit', this.#onUpsellSubmit, true);
    document.addEventListener(ThemeEvents.cartError, this.#clearUpsellLoading);

    if (history.state?.cartDrawerOpen) {
      history.replaceState(null, '');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.removeEventListener(DialogOpenEvent.eventName, this.#syncUpsellNavStates);
    this.removeEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);
    this.removeEventListener('click', this.#onUpsellNavClick);
    this.removeEventListener('scroll', this.#onUpsellRailScroll, true);
    this.removeEventListener('submit', this.#onUpsellSubmit, true);
    document.removeEventListener(ThemeEvents.cartError, this.#clearUpsellLoading);
    this.#historyAbortController?.abort();
  }

  #handleHistoryOpen = () => {
    if (!isMobileBreakpoint()) return;

    if (!history.state?.cartDrawerOpen) {
      history.pushState({ cartDrawerOpen: true }, '');
    }

    this.#historyAbortController = new AbortController();
    window.addEventListener('popstate', this.#handlePopState, { signal: this.#historyAbortController.signal });
  };

  #handleHistoryClose = () => {
    this.#historyAbortController?.abort();
    if (history.state?.cartDrawerOpen) {
      history.back();
    }
  };

  #handlePopState = async () => {
    if (this.refs.dialog?.open) {
      this.refs.dialog.style.setProperty('--dialog-drawer-closing-animation', 'none');
      await this.closeDialog();
      this.refs.dialog.style.removeProperty('--dialog-drawer-closing-animation');
    }
  };

  /**
   * Handles cart add events - opens drawer if auto-open and announces count when open.
   * @param {CustomEvent<{ resource?: { item_count?: number } }>} event
   */
  #handleCartAdd = (event) => {
    this.#clearUpsellLoading();

    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }

    this.#announceCartCount(event.detail.resource?.item_count);
  };

  /**
   * Announces cart count to screen readers when dialog is open.
   * @param {number | undefined} cartCount
   */
  #announceCartCount(cartCount) {
    const liveRegion = /** @type {HTMLElement | undefined} */ (this.refs.liveRegion);
    if (!this.refs.dialog?.open || !liveRegion || cartCount === undefined) return;

    liveRegion.textContent = `${Theme.translations.cart_count}: ${cartCount}`;
  }

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }

  #updateStickyState() {
    const { dialog } = /** @type {Refs} */ (this.refs);
    if (!dialog) return;

    // Refs do not cross nested `*-component` boundaries (e.g., `cart-items-component`), so we query within the dialog.
    const content = dialog.querySelector('.cart-drawer__content');
    const summary = dialog.querySelector('.cart-drawer__summary');

    if (!content || !summary) {
      // Ensure the dialog doesn't get stuck in "unsticky" mode when summary disappears (e.g., empty cart).
      dialog.setAttribute('cart-summary-sticky', 'false');
      return;
    }

    const drawerHeight = dialog.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    const ratio = summaryHeight / drawerHeight;
    dialog.setAttribute('cart-summary-sticky', ratio > this.#summaryThreshold ? 'false' : 'true');
  }

  /**
   * @param {MouseEvent} event
   */
  #onUpsellNavClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-upsell-nav]') : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const rail = this.#getUpsellRail(button.dataset.upsellRailId);
    if (!rail) return;

    const direction = button.dataset.upsellNav === 'next' ? 1 : -1;
    const scrollStep = Math.max(rail.clientWidth * 0.86, 220);
    rail.scrollBy({ left: direction * scrollStep, behavior: 'smooth' });

    window.setTimeout(() => this.#updateUpsellNavState(rail), 350);
  };

  /**
   * @param {Event} event
   */
  #onUpsellRailScroll = (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-upsell-rail]')) return;
    this.#updateUpsellNavState(event.target);
  };

  /**
   * @param {SubmitEvent} event
   */
  #onUpsellSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('.cart-drawer__upsell-form')) return;

    const submitButton = form.querySelector('.cart-drawer__upsell-button');
    if (!(submitButton instanceof HTMLButtonElement) || submitButton.disabled) return;

    submitButton.dataset.loading = 'true';
    submitButton.disabled = true;
  };

  #clearUpsellLoading = () => {
    this.querySelectorAll('.cart-drawer__upsell-button[data-loading="true"]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;

      button.disabled = false;
      button.removeAttribute('data-loading');
    });
  };

  #syncUpsellNavStates = () => {
    window.requestAnimationFrame(() => {
      this.querySelectorAll('[data-upsell-rail]').forEach((rail) => {
        if (rail instanceof HTMLElement) this.#updateUpsellNavState(rail);
      });
    });
  };

  /**
   * @param {string | undefined} railId
   * @returns {HTMLElement | null}
   */
  #getUpsellRail(railId) {
    if (!railId) return null;
    const rail = this.querySelector(`[data-upsell-rail][data-upsell-rail-id="${railId}"]`);
    return rail instanceof HTMLElement ? rail : null;
  }

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
    prevButton.disabled = rail.scrollLeft <= 2;
    nextButton.disabled = rail.scrollLeft >= maxScrollLeft - 2;
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}
