import { cleanup, render, screen } from '@testing-library/react';
import { Badge } from '../../src/common/Badge';

/**
 * TEST-056 → AC-007.
 *
 * The claim is that no tone relies on colour alone. Each tone must therefore
 * carry readable text AND a non-colour signal, and the decorative glyph must be
 * hidden so it is not announced twice.
 */
const tones = ['success', 'warning', 'error', 'neutral', 'info'] as const;

afterEach(cleanup);

describe('Badge', () => {
  it('AC-007: every tone renders its label as text', () => {
    for (const tone of tones) {
      const { unmount } = render(<Badge tone={tone}>Checked in</Badge>);
      expect(screen.getByText('Checked in'), `${tone} lost its label`).toBeInTheDocument();
      unmount();
    }
  });

  it('AC-007: every tone pairs the label with a non-colour cue', () => {
    const cues = new Set<string>();

    for (const tone of tones) {
      const { container, unmount } = render(<Badge tone={tone}>Status</Badge>);

      const srText = container.querySelector('.sr-only')?.textContent?.trim() ?? '';
      expect(srText.length, `${tone} has no screen-reader cue`).toBeGreaterThan(0);
      cues.add(srText);

      // The visible glyph carries the same signal for users who cannot read the
      // tint, and is hidden from assistive tech to avoid repeating the cue.
      const glyph = container.querySelector('[aria-hidden]');
      expect(glyph?.textContent?.trim().length, `${tone} has no glyph`).toBeGreaterThan(0);

      unmount();
    }

    // Distinct cues, otherwise five tones would announce identically.
    expect(cues.size).toBe(tones.length);
  });

  it('AC-007: the accessible name is tone word plus label, so colour is redundant', () => {
    for (const tone of tones) {
      const { unmount } = render(<Badge tone={tone}>Confirmed</Badge>);

      // The sr-only cue sits immediately before the label, so the announced text
      // is "<tone> <label>" even with the glyph hidden.
      const badge = screen.getByText('Confirmed').closest('span[class*="rounded-full"]');
      expect(badge?.textContent).toMatch(/(Positive|Caution|Problem|Note|Info):\s*Confirmed$/);
      unmount();
    }
  });

  it('AC-007: the default tone is neutral, not an unnamed colour', () => {
    render(<Badge>Pending</Badge>);

    const badge = screen.getByText('Pending').closest('span[class*="rounded-full"]');
    expect(badge?.textContent).toBe('•Note: Pending');
    expect(badge?.textContent).toContain('Note:');
  });
});
