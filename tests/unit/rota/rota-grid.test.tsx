import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

// A day of `count` sessions, each with a header of times and one half-filled job.
function sessionsOnOneDay(count: number): RotaGridSection[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    day_label: 'Sat',
    title: `Session ${index + 1}`,
    subtitle: 'Weigh-in 7:00am · Lift-off 9:00am',
    sort_order: index,
    roles: [
      {
        id: `refs-${index + 1}`,
        title: 'Refs',
        arrive_by: '8:30am',
        sort_order: 0,
        capacity: 3,
        filled: [{ key: `ref-${index + 1}`, name: 'Priya' }],
      },
    ],
  }));
}

describe('RotaGrid — three sessions squeezed onto a phone', () => {
  it('gives a grid of exactly three sessions narrower columns, each time under its label', () => {
    render(<RotaGrid sections={sessionsOnOneDay(3)} />);
    const header = screen.getByRole('columnheader', { name: /Session 3/ });
    expect(header.className.split(' ')).toEqual(expect.arrayContaining(['min-w-18', 'sm:min-w-28']));
    // The label and the time are separate pieces, so CSS can stack them on a phone.
    expect(within(header).getByText('Weigh-in')).toBeInTheDocument();
    expect(within(header).getByText('7:00am')).toBeInTheDocument();
    expect(within(header).getByText('Arrive by')).toBeInTheDocument();
    expect(within(header).getByText('8:30am')).toBeInTheDocument();
    // The count keeps its word for a screen reader and for a wider screen.
    expect(header).toHaveTextContent('1 / 3 filled');
    expect(within(header).getByText('filled').className).toContain('sr-only');
    expect(screen.getAllByText('Priya')[0].className.split(' ')).toContain('px-px');
  });

  it.each([2, 4])('leaves a grid of %i sessions at the usual size', (count) => {
    render(<RotaGrid sections={sessionsOnOneDay(count)} />);
    const header = screen.getByRole('columnheader', { name: /Session 2/ });
    expect(header.className.split(' ')).toContain('min-w-28');
    expect(header.className.split(' ')).not.toContain('min-w-18');
    expect(within(header).getByText('Weigh-in 7:00am')).toBeInTheDocument();
    expect(within(header).getByText('1 / 3 filled')).toBeInTheDocument();
    expect(screen.getAllByText('Priya')[0].className.split(' ')).not.toContain('px-px');
  });
});
