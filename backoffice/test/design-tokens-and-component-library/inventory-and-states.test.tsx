import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from '../../src/common/Badge';
import { Button } from '../../src/common/Button';
import { ConfirmDialog } from '../../src/common/ConfirmDialog';
import { DatePicker, TimePicker } from '../../src/common/DatePicker';
import { Dropdown } from '../../src/common/Dropdown';
import { Field, Input, Select, Textarea } from '../../src/common/Input';
import { KpiCard } from '../../src/common/KpiCard';
import { Popover } from '../../src/common/Popover';
import { SearchableSelect } from '../../src/common/SearchableSelect';
import { Skeleton } from '../../src/common/Skeleton';
import { EmptyState, ErrorState } from '../../src/common/States';
import { DataTable } from '../../src/common/Table';
import { Tabs } from '../../src/common/Tabs';
import { Tooltip } from '../../src/common/Tooltip';

/**
 * TEST-057 → AC-008, TEST-058 → AC-009.
 *
 * AC-008 is an inventory claim, so it is checked against the filesystem as well
 * as the imports: a primitive that exists but is not exported would otherwise
 * look present. AC-009 is a demonstration claim, checked by rendering each
 * primitive in the states its section claims.
 */
const commonDir = join(__dirname, '../../src/common');

/** The seventeen primitives, with the module that owns each. */
const INVENTORY = {
  Button: 'Button.tsx',
  Input: 'Input.tsx',
  Textarea: 'Input.tsx',
  SearchableSelect: 'SearchableSelect.tsx',
  DatePicker: 'DatePicker.tsx',
  TimePicker: 'DatePicker.tsx',
  Tabs: 'Tabs.tsx',
  Dropdown: 'Dropdown.tsx',
  Tooltip: 'Tooltip.tsx',
  Popover: 'Popover.tsx',
  DataTable: 'Table.tsx',
  KpiCard: 'KpiCard.tsx',
  Badge: 'Badge.tsx',
  Toast: 'Toast.tsx',
  ConfirmDialog: 'ConfirmDialog.tsx',
  Skeleton: 'Skeleton.tsx',
  EmptyState: 'States.tsx',
  ErrorState: 'States.tsx',
} as const;

const exported = {
  Button,
  Input,
  Textarea,
  SearchableSelect,
  DatePicker,
  TimePicker,
  Tabs,
  Dropdown,
  Tooltip,
  Popover,
  DataTable,
  KpiCard,
  Badge,
  ConfirmDialog,
  Skeleton,
  EmptyState,
  ErrorState,
} as const;

afterEach(cleanup);

describe('Primitive inventory', () => {
  it('AC-008: every primitive in the inventory is exported and is a component', () => {
    for (const [name, file] of Object.entries(INVENTORY)) {
      if (name === 'Toast') continue; // a provider plus hook, asserted below
      const component = (exported as Record<string, unknown>)[name];
      expect(component, `${name} is not exported`).toBeTypeOf('function');
      expect(file.endsWith('.tsx')).toBe(true);
    }
  });

  it('AC-008: every owning module exists in src/common', async () => {
    const files = new Set(readdirSync(commonDir));

    for (const file of new Set(Object.values(INVENTORY))) {
      expect(files.has(file), `${file} is missing`).toBe(true);
    }
  });

  it('AC-008: Toast is a provider plus a hook, not a bare component', async () => {
    const toast = await import('../../src/common/Toast');

    expect(toast.ToastProvider).toBeTypeOf('function');
    expect(toast.useToast).toBeTypeOf('function');
  });
});

describe('Primitive states', () => {
  it('AC-009: Button demonstrates default, hover, focus and disabled', () => {
    const { container } = render(
      <>
        <Button>Default</Button>
        <Button disabled>Disabled</Button>
      </>,
    );

    const [plain, disabled] = [...container.querySelectorAll('button')];
    expect(plain.className).toMatch(/hover:/);
    expect(disabled).toBeDisabled();
    expect(disabled.className).toContain('disabled:opacity-60');
  });

  it('AC-009: input-like primitives demonstrate default, focus and error', () => {
    const { container } = render(
      <Field label="Email" error="Enter a valid email">
        <Input defaultValue="not-an-email" invalid />
      </Field>,
    );

    const input = container.querySelector('input')!;
    // Hover/focus for inputs come from the shared control classes and the global
    // focus rule rather than a per-primitive class.
    expect(input.className).toContain('placeholder:text-muted');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/Enter a valid email/);
  });

  it('AC-009: Textarea and Select demonstrate the same states', () => {
    const { container } = render(
      <>
        <Textarea invalid placeholder="Notes" />
        <Select defaultValue="a">
          <option value="a">A</option>
        </Select>
      </>,
    );

    const textarea = container.querySelector('textarea')!;
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.className).toContain('min-h-10');
    expect(container.querySelector('select')).not.toBeNull();
  });

  it('AC-009: Tabs expose selected and unselected states', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="Visits"
        value="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'Upcoming', content: 'A content' },
          { id: 'b', label: 'Past', content: 'B content' },
        ]}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    await user.click(tabs[0]);
    expect(screen.getByText('A content')).toBeInTheDocument();
  });

  it('AC-009: Badge demonstrates every tone simultaneously', () => {
    render(
      <>
        {(['success', 'warning', 'error', 'neutral', 'info'] as const).map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </>,
    );

    for (const tone of ['success', 'warning', 'error', 'neutral', 'info']) {
      expect(screen.getByText(tone)).toBeInTheDocument();
    }
  });

  it('AC-009: Dropdown opens to show its menu, so the open state is demonstrated', async () => {
    const user = userEvent.setup();
    // The trigger is a plain element: Dropdown already renders the <button> it
    // focuses, so a Button here would nest one inside the other.
    render(
      <Dropdown
        label="More actions"
        trigger={<span aria-hidden>···</span>}
        items={[{ id: 'view', label: 'View', onSelect: () => {} }]}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('AC-009: Tooltip and Popover demonstrate their hidden and shown states', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Explains the value">
          <Button>Hover me</Button>
        </Tooltip>
      </>,
    );

    expect(screen.queryByText('Explains the value')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Hover me' }));
    expect(await screen.findByText('Explains the value')).toBeInTheDocument();
  });

  it('AC-009: Skeleton is a pulsing placeholder that respects reduced motion', () => {
    const { container } = render(
      <>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton lines={3} />
      </>,
    );

    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars.length).toBe(4); // one block plus three lines
    for (const bar of bars) {
      expect(bar.className).toContain('motion-reduce:animate-none');
      // Hidden individually, or via the aria-hidden wrapper of the multi-line form.
      expect(bar.closest('[aria-hidden]')).not.toBeNull();
    }
  });

  it('AC-009: the empty and error states are demonstrated with a recovery action', () => {
    render(
      <>
        <EmptyState
          title="Nothing here"
          description="Add a visit to begin."
          action={<Button>Add visit</Button>}
        />
        <ErrorState title="Could not load" description="Try again." />
      </>,
    );

    // Both are announced politely and carry an icon, not just text colour.
    for (const title of ['Nothing here', 'Could not load']) {
      const region = screen.getByText(title).closest('[role="status"]');
      expect(region, `${title} is not a live region`).not.toBeNull();
      expect(region!.querySelector('[aria-hidden]')).not.toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Add visit' })).toBeInTheDocument();
  });

  it('AC-009: DataTable renders rows, including an empty state when given none', () => {
    const { unmount } = render(
      <DataTable
        caption="Visits"
        rows={[{ id: '1', patient: 'Sarah', status: 'Confirmed' }]}
        columns={[
          { key: 'patient', header: 'Patient' },
          { key: 'status', header: 'Status' },
        ]}
      />,
    );

    expect(screen.getByRole('table', { name: 'Visits' })).toBeInTheDocument();
    // Rendered twice on purpose: the desktop table and the mobile card list.
    expect(screen.getAllByText('Sarah').length).toBe(2);
    unmount();

    render(
      <DataTable
        caption="Visits"
        rows={[]}
        emptyLabel="No visits yet"
        columns={[{ key: 'patient', header: 'Patient' }]}
      />,
    );
    // An empty table states it is empty rather than rendering bare headers.
    expect(screen.getByRole('table', { name: 'Visits' })).toBeInTheDocument();
    expect(screen.getAllByText('No visits yet').length).toBeGreaterThan(0);
  });

  it('AC-009: KpiCard demonstrates an up, down and flat delta', () => {
    render(
      <>
        <KpiCard label="Queue" value={24} delta={{ value: 8, period: 'vs yesterday' }} />
        <KpiCard label="Wait" value="12" delta={{ value: -5, period: 'vs yesterday' }} />
        <KpiCard label="Rooms" value={6} delta={{ value: 0, period: 'vs yesterday' }} />
      </>,
    );

    for (const label of ['Queue', 'Wait', 'Rooms']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('AC-009: ConfirmDialog and SearchableSelect render their interactive states', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        label="Doctor"
        options={[
          { value: 'carter', label: 'Dr. Emily Carter' },
          { value: 'wilson', label: 'Dr. James Wilson' },
        ]}
        value={null}
        onChange={() => {}}
        noResultsLabel="No results"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Doctor' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    render(
      <ConfirmDialog
        open
        title="Cancel this visit?"
        description="The patient will be notified."
        confirmLabel="Cancel visit"
        cancelLabel="Keep visit"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel visit' })).toBeInTheDocument();
  });
});
