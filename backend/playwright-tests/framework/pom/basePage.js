export class BasePage {
  constructor(page) {
    this.page = page;
  }

  parseRoleSelector(selector) {
    const match = String(selector || '').match(/^role=([a-z]+)(?:\[name(\*?)=['\"](.+?)['\"]\])?$/i);
    if (!match) {
      return null;
    }

    return {
      role: match[1],
      isPartial: match[2] === '*',
      name: match[3] || ''
    };
  }

  textPattern(value) {
    const escaped = String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  async firstExisting(candidates) {
    for (const locator of candidates) {
      if (!locator) {
        continue;
      }

      try {
        if (await locator.count()) {
          return locator.first();
        }
      } catch {
        // Ignore malformed locator candidates and continue.
      }
    }

    return null;
  }

  semanticCandidates(hint) {
    const text = String(hint || '').toLowerCase();
    const candidates = [];

    if (text.includes('search')) {
      candidates.push(this.page.getByRole('searchbox', { name: /search/i }));
      candidates.push(this.page.getByPlaceholder(/search/i));
      candidates.push(this.page.getByLabel(/search/i));
      candidates.push(this.page.locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'));
    }

    if (text.includes('view details') || text.includes('details')) {
      candidates.push(this.page.getByRole('link', { name: /details|view details/i }));
    }

    if (text.includes('add to cart') || text.includes('add')) {
      candidates.push(this.page.getByRole('button', { name: /add to cart|add/i }));
    }

    if (text.includes('cart')) {
      candidates.push(this.page.getByRole('link', { name: /cart/i }));
    }

    return candidates;
  }

  async resolveLocator(selector, description) {
    const selectorText = String(selector || '').trim();
    const descriptionText = String(description || '').trim();
    const candidates = [];

    if (selectorText) {
      candidates.push(this.page.locator(selectorText));

      const roleInfo = this.parseRoleSelector(selectorText);
      if (roleInfo) {
        if (roleInfo.name) {
          candidates.push(this.page.getByRole(roleInfo.role, {
            name: roleInfo.isPartial ? this.textPattern(roleInfo.name) : roleInfo.name
          }));
        } else {
          candidates.push(this.page.getByRole(roleInfo.role));
        }
      }

      if (selectorText.startsWith('text=')) {
        candidates.push(this.page.getByText(selectorText.slice(5)));
      }
    }

    candidates.push(...this.semanticCandidates(`${selectorText} ${descriptionText}`));

    const resolved = await this.firstExisting(candidates);
    if (!resolved) {
      throw new Error(`Unable to resolve locator. selector="${selectorText}" description="${descriptionText}"`);
    }

    return resolved;
  }
}
