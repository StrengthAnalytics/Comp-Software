import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ENTRY_FORM_DEFAULTS } from '@/types/entry-form';

// The designer's two server actions and the router refresh are the only things that reach the
// network; stub them so the test drives the save/toggle flows deterministically.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/entry-form', () => ({
  saveEntryFormDesignAction: vi.fn(),
  setEntryFormOpenAction: vi.fn(),
}));

import { saveEntryFormDesignAction, setEntryFormOpenAction } from '@/actions/entry-form';
import { EntryFormDesigner } from '@/components/entries/entry-form-designer';

const saveAction = vi.mocked(saveEntryFormDesignAction);
const openAction = vi.mocked(setEntryFormOpenAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

function renderDesigner(overrides?: { initialOpen?: boolean }) {
  return render(
    <EntryFormDesigner
      competitionId={COMP_ID}
      slug="summer-open"
      competitionStatus="draft"
      initialConfig={ENTRY_FORM_DEFAULTS}
      initialOpen={overrides?.initialOpen ?? false}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EntryFormDesigner', () => {
  it('renders a radiogroup per toggleable field with the design state selected', () => {
    renderDesigner();
    const club = screen.getByRole('radiogroup', { name: 'Club on the entry form' });
    expect(club).toBeInTheDocument();
    const email = screen.getByRole('radiogroup', { name: 'Email address on the entry form' });
    const required = email.querySelector('input[value="required"]');
    expect(required).toBeInstanceOf(HTMLInputElement);
    expect((required as HTMLInputElement).checked).toBe(true);
  });

  it('saves the edited design, including the disclaimer, and reports Saved', async () => {
    saveAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderDesigner();

    const kit = screen.getByRole('radiogroup', { name: 'Raw / Equipped on the entry form' });
    fireEvent.click(kit.querySelector('input[value="required"]') as HTMLInputElement);
    fireEvent.change(screen.getByLabelText('Disclaimer'), {
      target: { value: 'I am a current member.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save form design' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'));
    expect(saveAction).toHaveBeenCalledWith({
      competitionId: COMP_ID,
      config: {
        fields: { ...ENTRY_FORM_DEFAULTS.fields, kit: 'required' },
        disclaimer: 'I am a current member.',
      },
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('sends a blank disclaimer as null', async () => {
    saveAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderDesigner();
    fireEvent.click(screen.getByRole('button', { name: 'Save form design' }));
    await waitFor(() => expect(saveAction).toHaveBeenCalled());
    expect(saveAction.mock.calls[0]?.[0]?.config.disclaimer).toBeNull();
  });

  it('surfaces a failed save instead of claiming Saved', async () => {
    saveAction.mockResolvedValue({ status: 'error', message: 'Could not save the form design. Please try again.' });
    renderDesigner();
    fireEvent.click(screen.getByRole('button', { name: 'Save form design' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save the form design.'),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens the form optimistically and rolls back when the action fails', async () => {
    openAction.mockResolvedValue({ status: 'error', message: 'Could not update the form. Please try again.' });
    renderDesigner();

    expect(screen.getByText('Not accepting entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the form' }));
    // Optimistic flip…
    expect(screen.getByText('Accepting entries')).toBeInTheDocument();
    // …rolled back when the action rejects.
    await waitFor(() => expect(screen.getByText('Not accepting entries')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not update the form.');
    expect(openAction).toHaveBeenCalledWith({ competitionId: COMP_ID, open: true });
  });

  it('closes an open form', async () => {
    openAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderDesigner({ initialOpen: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close the form' }));
    await waitFor(() => expect(screen.getByText('Not accepting entries')).toBeInTheDocument());
    expect(openAction).toHaveBeenCalledWith({ competitionId: COMP_ID, open: false });
  });

  it('warns that a draft comp’s form is not live', () => {
    renderDesigner();
    expect(screen.getByText(/still a draft/)).toBeInTheDocument();
  });
});
