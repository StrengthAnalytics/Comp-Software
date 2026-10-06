import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/rota', () => ({ setRotaStyleAction: vi.fn() }));

import { setRotaStyleAction } from '@/actions/rota';
import { RotaFormatting } from '@/components/rota/rota-formatting';
import type { RotaGridSection } from '@/components/rota/rota-grid';
import { DEFAULT_ROTA_STYLE } from '@/types/rota-style';

const setStyle = vi.mocked(setRotaStyleAction);
const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

function column(id: string, day: string, title: string, names: string[]): RotaGridSection {
  return {
    id,
    day_label: day,
    title,
    subtitle: null,
    sort_order: Number(id.slice(-1)),
    roles: [
      {
        id: `${id}-mc`,
        title: 'MC',
        arrive_by: null,
        sort_order: 0,
        capacity: 1,
        filled: names.map((name) => ({ key: `${id}-${name}`, name })),
      },
      { id: `${id}-refs`, title: 'Refs', arrive_by: null, sort_order: 1, capacity: 1, filled: [] },
    ],
  };
}

// Sat AM, Sat PM, Sun AM — so Sat PM ends a day.
const SECTIONS = [column('c1', 'Sat', 'AM', ['Beth']), column('c2', 'Sat', 'PM', []), column('c3', 'Sun', 'AM', [])];

function previewCell(name: string): HTMLElement {
  const preview = screen.getByRole('region', { name: 'Preview' });
  return within(preview).getByText(name).closest('td') as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RotaFormatting', () => {
  it('previews the real rota with heavier lines between days than between sessions', () => {
    render(<RotaFormatting competitionId={COMP_ID} sections={SECTIONS} initialStyle={DEFAULT_ROTA_STYLE} />);

    const preview = screen.getByRole('region', { name: 'Preview' });
    const [firstRow] = within(preview).getAllByRole('row').slice(-2);
    const cells = within(firstRow).getAllByRole('cell');
    expect(cells[0]).toHaveClass('border-r-2'); // Sat AM → Sat PM: a session line
    expect(cells[1]).toHaveClass('border-r-4'); // Sat PM → Sun AM: a day line
    expect(previewCell('Beth')).toHaveClass('border-b');
  });

  it('updates the preview as options are picked, and saves the chosen look', async () => {
    setStyle.mockResolvedValue({ status: 'ok', data: undefined });
    render(<RotaFormatting competitionId={COMP_ID} sections={SECTIONS} initialStyle={DEFAULT_ROTA_STYLE} />);

    fireEvent.click(within(screen.getByRole('group', { name: 'Between jobs (rows)' })).getByRole('button', { name: 'Thick' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Filled slots' })).getByRole('button', { name: 'Blue' }));

    expect(previewCell('Beth')).toHaveClass('border-b-4');
    expect(within(screen.getByRole('region', { name: 'Preview' })).getByText('Beth')).toHaveClass('bg-sky-400');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save formatting' }));
    await waitFor(() =>
      expect(setStyle).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        style: { ...DEFAULT_ROTA_STYLE, roleLines: 'thick', filledColour: 'blue' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('saves the default look as null', async () => {
    setStyle.mockResolvedValue({ status: 'ok', data: undefined });
    render(
      <RotaFormatting
        competitionId={COMP_ID}
        sections={SECTIONS}
        initialStyle={{ ...DEFAULT_ROTA_STYLE, bannerColour: 'red' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to the default look' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save formatting' }));

    await waitFor(() => expect(setStyle).toHaveBeenCalledWith({ competitionId: COMP_ID, style: null }));
  });

  it('shows a sample rota when there are no columns yet', () => {
    render(<RotaFormatting competitionId={COMP_ID} sections={[]} initialStyle={DEFAULT_ROTA_STYLE} />);
    expect(screen.getByText('Preview (sample rota)')).toBeInTheDocument();
  });
});
