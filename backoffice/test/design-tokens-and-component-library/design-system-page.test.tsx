import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n';
import { DesignSystemPage } from '../../src/pages/DesignSystemPage';
import { color, tokens } from '../../src/design-system/tokens';

/**
 * TEST-052 → AC-003, TEST-054 → AC-005, TEST-055 → AC-006, TEST-059 → AC-010.
 *
 * jsdom lays nothing out, so three claims are asserted structurally and
 * reported as partial in the test report rather than claimed as measured:
 *   - AC-005 "no clipping / no horizontal scrollbar" — cannot be computed here.
 *   - AC-006 "visible focus indicator" — the ring is a global CSS rule jsdom
 *     does not apply, so the rule's presence and focusability are asserted.
 *   - AC-010 375 px overflow and the card-list breakpoint — asserted as the
 *     responsive classes that produce the collapse.
 */
const root = join(__dirname, '../..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

beforeAll(() => {
  // recharts measures its container; jsdom has no ResizeObserver.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

function mount() {
  return render(<DesignSystemPage />);
}

describe('Design system page', () => {
  it('AC-003: token swatches are rendered from the token module', async () => {
    mount();

    const section = await screen.findByRole('region', { name: /tokens/i });

    // Every colour token name appears with its resolved hex value.
    for (const [name, hex] of Object.entries(color)) {
      expect(within(section).getByText(name), `${name} swatch missing`).toBeInTheDocument();
      expect(within(section).getAllByText(hex).length, `${name} hex missing`).toBeGreaterThan(0);
    }

    // The other four groups are driven by the same module.
    for (const group of ['font', 'radius', 'space', 'elevation'] as const) {
      for (const name of Object.keys(tokens[group])) {
        expect(
          within(section).getAllByText(name).length,
          `${group}.${name} missing`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('AC-003: no swatch is hard-coded, so an unknown token cannot be displayed', async () => {
    mount();
    const section = await screen.findByRole('region', { name: /tokens/i });

    const swatches = within(section)
      .getAllByText(/^#[0-9a-f]{6}$/i)
      .map((node) => node.textContent);

    expect(swatches.length).toBeGreaterThan(0);
    expect(swatches.every((hex) => Object.values(color).includes(hex!))).toBe(true);
  });

  it('AC-005: under RTL the page keeps its structure and uses logical spacing', async () => {
    document.documentElement.dir = 'rtl';
    try {
      await i18n.changeLanguage('ar');
      const { container } = mount();
      await screen.findByRole('heading', { level: 1 });

      // No physical-direction utilities anywhere on the rendered page.
      const offenders: string[] = [];
      for (const node of [container, ...container.querySelectorAll('*')]) {
        const className = (node as HTMLElement).className;
        if (typeof className !== 'string') continue;
        if (/(?<![\w-])(?:ml|mr|pl|pr|left|right)-[\w[]/.test(className)) {
          offenders.push(className);
        }
      }
      expect(offenders, 'physical-direction utility rendered under RTL').toEqual([]);

      // Every section still renders, so the mirroring is structural, not selective.
      expect(screen.getAllByRole('region').length).toBeGreaterThanOrEqual(6);
    } finally {
      document.documentElement.dir = 'ltr';
      await i18n.changeLanguage('en');
    }
  });

  it('AC-005: no element pins itself with a physical inline style', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 1 });

    const pinned = [...container.querySelectorAll<HTMLElement>('[style]')].filter((node) => {
      const style = node.getAttribute('style') ?? '';
      return /(?:^|;)\s*(?:left|right|margin-left|margin-right|padding-left|padding-right)\s*:/.test(
        style,
      );
    });

    expect(pinned).toEqual([]);
  });

  it('AC-006: every interactive primitive is reachable in DOM order', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await screen.findByRole('heading', { level: 1 });

    const focusable = [
      ...container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => node.tabIndex >= 0);

    expect(focusable.length).toBeGreaterThan(10);

    // Tabbing visits each one at most once, and never in an order that differs
    // from document order.
    const visited: HTMLElement[] = [];
    for (let step = 0; step < focusable.length; step += 1) {
      await user.tab();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) visited.push(active);
    }

    const positions = visited.map((node) => focusable.indexOf(node));
    expect(positions.some((position) => position === -1)).toBe(false);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('AC-006: buttons activate with Enter and Space', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('heading', { level: 1 });

    const toasts = screen.getByRole('button', { name: /success toast/i });

    toasts.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/visit rescheduled/i)).toBeInTheDocument();

    const errorButton = screen.getByRole('button', { name: /error toast/i });
    errorButton.focus();
    await user.keyboard(' ');
    // Space triggers the same path; the error toast is announced assertively.
    expect(await screen.findByText(/could not save the visit/i)).toBeInTheDocument();
  });

  it('AC-006: the focus indicator is a global rule the page inherits', () => {
    // jsdom does not cascade :focus-visible, so the rule itself is the evidence.
    expect(css).toMatch(/\*:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-primary\)/);
    expect(css).toMatch(/outline-offset:\s*2px/);
  });

  it('AC-010: the table collapses to a card list below the md breakpoint', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 1 });

    // Table branch: hidden until md, so 375 px never shows it.
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    const tableBranch = table!.closest('div');
    expect(tableBranch?.className).toContain('hidden');
    expect(tableBranch?.className).toContain('md:block');

    // Card branch: visible only below md.
    const cardList = container.querySelector('ul');
    expect(cardList).not.toBeNull();
    expect(cardList!.className).toContain('md:hidden');

    // The card list carries the same rows, so nothing is lost at 375 px.
    const cardRows = within(cardList as HTMLElement).getAllByRole('listitem');
    expect(cardRows.length).toBeGreaterThan(0);
    const tableRows = container.querySelectorAll('tbody tr');
    expect(cardRows.length).toBe(tableRows.length);
  });

  it('AC-006: no interactive control is nested inside another', async () => {
    // A <button> inside a <button> is invalid HTML: the inner control is not
    // separately focusable in every browser, which breaks "reachable for every
    // primitive". Recorded here because the Dropdown demo trips it.
    const { container } = mount();
    await screen.findByRole('heading', { level: 1 });

    const nested: string[] = [];
    for (const outer of container.querySelectorAll('button, a[href]')) {
      for (const inner of outer.querySelectorAll('button, a[href]')) {
        nested.push(
          `<${outer.tagName.toLowerCase()} aria-label="${outer.getAttribute('aria-label') ?? outer.textContent}"> > <${inner.tagName.toLowerCase()}>`,
        );
      }
    }

    expect(nested, 'interactive element nested inside another').toEqual([]);
  });

  it('AC-010: the wide table scrolls inside its own container rather than the page', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 1 });

    const scroller = container.querySelector('table')?.closest('.overflow-x-auto');
    expect(scroller, 'table needs an overflow-x-auto container').not.toBeNull();
  });
});
