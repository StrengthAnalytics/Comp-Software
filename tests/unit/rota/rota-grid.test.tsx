import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RotaGrid, type RotaGridSection } from '@/components/rota/rota-grid';

const sections: RotaGridSection[] = [
  {
    id: 'sat-1',
    day_label: 'Sat',
    title: 'Session 1',
    subtitle: null,
    sort_order: 0,
    roles: [{ id: 'mc-1', title: 'MC', arrive_by: null, sort_order: 0, capacity: 1, filled: [] }],
  },
  {
    id: 'sun-1',
    day_label: 'Sun',
    title: 'Session 1',
    subtitle: null,
    sort_order: 1,
    roles: [{ id: 'mc-2', title: 'MC', arrive_by: null, sort_order: 0, capacity: 1, filled: [] }],
  },
];

// jsdom lays nothing out, so say how wide the grid and its window onto it are. The grid's scroller
// is the table's parent.
function renderGridWithWidths(visible: number, whole: number) {
  const view = render(<RotaGrid sections={sections} />);
  const scroller = screen.getByRole('table').parentElement;
  if (!scroller) {
    throw new Error('The rota table has no scroller around it');
  }
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: visible });
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: whole });
  scroller.scrollBy = vi.fn();
  // The grid measures as it mounts and whenever it is scrolled.
  fireEvent.scroll(scroller);
  return { ...view, scroller };
}

afterEach(() => {
  cleanup();
});

describe('RotaGrid — "More" button', () => {
  it('is absent when the whole grid is on screen', () => {
    renderGridWithWidths(600, 600);
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
  });

  it('shows while columns are out of sight to the right, and slides the grid along when tapped', () => {
    const { scroller } = renderGridWithWidths(350, 600);
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 210, behavior: 'smooth' });
  });

  it('goes once the grid has been scrolled to its right-hand end', () => {
    const { scroller } = renderGridWithWidths(350, 600);
    expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument();
    act(() => {
      scroller.scrollLeft = 249;
      fireEvent.scroll(scroller);
    });
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
  });
});
