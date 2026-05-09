class FAQPageContent extends HTMLElement {
  connectedCallback() {
    if (this.dataset.enhanced === 'true') return;

    const formatter = this.querySelector('rte-formatter');
    if (!formatter) return;

    const groups = this.#buildGroups(Array.from(formatter.children));
    if (groups.length < 2) return;

    const list = document.createElement('div');
    list.className = 'faq-page-content__list';

    groups.forEach((group, index) => {
      const details = document.createElement('details');
      details.className = 'faq-page-content__item';
      if (index === 0) details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'faq-page-content__summary';
      summary.textContent = group.heading;

      const panel = document.createElement('div');
      panel.className = 'faq-page-content__panel rte';
      group.content.forEach((node) => panel.append(node));

      details.append(summary, panel);
      list.append(details);
    });

    formatter.replaceChildren(list);
    this.dataset.enhanced = 'true';
  }

  #buildGroups(elements) {
    const headingGroups = this.#groupsFromHeadings(elements);
    if (headingGroups.length >= 2) return headingGroups;

    return this.#groupsFromQuestionText(elements);
  }

  #groupsFromHeadings(elements) {
    const groups = [];
    let current = null;

    elements.forEach((element) => {
      if (this.#isHeading(element)) {
        if (current && current.content.length > 0) groups.push(current);
        current = {
          heading: element.textContent.trim(),
          content: [],
        };
        return;
      }

      if (current) {
        current.content.push(element);
      }
    });

    if (current && current.content.length > 0) groups.push(current);

    return groups;
  }

  #groupsFromQuestionText(elements) {
    const groups = [];
    let current = null;

    elements.forEach((element) => {
      if (this.#isQuestionElement(element)) {
        if (current && current.content.length > 0) groups.push(current);
        current = {
          heading: element.textContent.trim(),
          content: [],
        };
        return;
      }

      if (current) {
        current.content.push(element);
      }
    });

    if (current && current.content.length > 0) groups.push(current);

    return groups;
  }

  #isHeading(element) {
    return /^H[2-6]$/.test(element.tagName) && element.textContent.trim() !== '';
  }

  #isQuestionElement(element) {
    const text = element.textContent.trim();
    return text.endsWith('?') && text.length <= 140 && !element.querySelector('img, table, form, iframe');
  }
}

if (!customElements.get('faq-page-content')) {
  customElements.define('faq-page-content', FAQPageContent);
}
