import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tabs } from '@/components/ui/tabs';

const tabs = [
  { id: 'add', label: 'Add lifters' },
  { id: 'awaiting', label: 'Awaiting approval', badge: 2 },
  { id: 'registered', label: 'Registered lifters' },
];

function renderTabs(overrides?: { initialTabId?: string; badge?: number }) {
  const withBadge =
    overrides?.badge === undefined
      ? tabs
      : tabs.map((tab) => (tab.id === 'awaiting' ? { ...tab, badge: overrides.badge } : tab));
  return render(
    <Tabs
      tabs={withBadge}
      initialTabId={overrides?.initialTabId ?? 'add'}
      panels={{
        add: <p>Add panel</p>,
        awaiting: <p>Awaiting panel</p>,
        registered: <p>Registered panel</p>,
      }}
    />,
  );
}

afterEach(cleanup);

describe('Tabs', () => {
  it('shows the initial tab as selected with only its panel visible', () => {
    renderTabs({ initialTabId: 'registered' });
    expect(screen.getByRole('tab', { name: 'Registered lifters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Registered panel')).toBeVisible();
    expect(screen.getByText('Add panel')).not.toBeVisible();
  });

  it('switches panels on click but keeps inactive panels mounted', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: /Awaiting approval/ }));
    expect(screen.getByRole('tab', { name: /Awaiting approval/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Awaiting panel')).toBeVisible();
    // Hidden, not unmounted — subscriptions and mid-edit state in other panels survive.
    expect(screen.getByText('Add panel')).toBeInTheDocument();
    expect(screen.getByText('Add panel')).not.toBeVisible();
  });

  it('shows the badge count and hides it at zero', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: /Awaiting approval/ })).toHaveTextContent('2');

    cleanup();
    renderTabs({ badge: 0 });
    expect(screen.getByRole('tab', { name: 'Awaiting approval' })).not.toHaveTextContent('0');
  });

  it('moves selection with arrow keys, wrapping, and supports Home/End', () => {
    renderTabs();
    const first = screen.getByRole('tab', { name: 'Add lifters' });

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Awaiting approval/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: /Awaiting approval/ }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Add lifters' }), { key: 'ArrowLeft' });
    // Wrapped backwards from the first tab to the last.
    expect(screen.getByRole('tab', { name: 'Registered lifters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Registered lifters' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Add lifters' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Add lifters' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Registered lifters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('only the selected tab is in the tab order (roving tabindex)', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Add lifters' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Registered lifters' })).toHaveAttribute('tabindex', '-1');
  });

  it('falls back to the first tab when the initial id is unknown', () => {
    renderTabs({ initialTabId: 'nope' });
    expect(screen.getByRole('tab', { name: 'Add lifters' })).toHaveAttribute('aria-selected', 'true');
  });
});
