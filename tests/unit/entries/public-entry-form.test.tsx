import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ENTRY_FORM_DEFAULTS, type EntryFormConfig } from '@/types/entry-form';

// The submit action is the only thing that reaches the network; stub it.
vi.mock('@/actions/entry-form', () => ({
  submitEntryFormAction: vi.fn(),
}));

import { submitEntryFormAction } from '@/actions/entry-form';
import { PublicEntryForm, type PublicWeightClass } from '@/components/entries/public-entry-form';

const submitAction = vi.mocked(submitEntryFormAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

const allOff: EntryFormConfig['fields'] = {
  club: 'off',
  ipf_member_id: 'off',
  division: 'off',
  weight_class: 'off',
  predicted_total: 'off',
  recent_best_total: 'off',
  kit: 'off',
  event: 'off',
  instagram: 'off',
  email: 'off',
  phone: 'off',
};

const classes: PublicWeightClass[] = [
  { name: '-83 kg', gender: 'male' },
  { name: '-93 kg', gender: 'male' },
  { name: '-63 kg', gender: 'female' },
];

function renderForm(
  config?: { fields?: Partial<EntryFormConfig['fields']>; disclaimer?: string | null },
  weightClasses: PublicWeightClass[] = [],
) {
  return render(
    <PublicEntryForm
      competitionId={COMP_ID}
      competitionName="Summer Open"
      config={{
        fields: { ...allOff, ...config?.fields },
        disclaimer: config?.disclaimer ?? null,
      }}
      weightClasses={weightClasses}
    />,
  );
}

function fillAlwaysFields() {
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Smith' } });
  fireEvent.change(screen.getByLabelText(/Sex/), { target: { value: 'female' } });
  fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: '1995-06-15' } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PublicEntryForm', () => {
  it('renders only the questions the design switches on', () => {
    renderForm({ fields: { club: 'optional', instagram: 'required' } });
    expect(screen.getByLabelText('Club')).toBeInTheDocument();
    expect(screen.getByLabelText(/Instagram handle/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email address/)).toBeNull();
    expect(screen.queryByLabelText(/Phone/)).toBeNull();
    expect(screen.queryByText(/Raw or Equipped/)).toBeNull();
  });

  it('offers weight classes for the chosen sex and clears a stale choice when sex changes', () => {
    renderForm({ fields: { weight_class: 'optional' } }, classes);
    const select = screen.getByLabelText<HTMLSelectElement>(/Weight class/);
    expect(select).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Sex/), { target: { value: 'male' } });
    expect(select).not.toBeDisabled();
    const maleOptions = [...select.options].map((option) => option.value).filter(Boolean);
    expect(maleOptions).toEqual(['-83 kg', '-93 kg']);

    fireEvent.change(select, { target: { value: '-83 kg' } });
    fireEvent.change(screen.getByLabelText(/Sex/), { target: { value: 'female' } });
    expect(select.value).toBe('');
    const femaleOptions = [...select.options].map((option) => option.value).filter(Boolean);
    expect(femaleOptions).toEqual(['-63 kg']);
  });

  it('submits the lifter’s answers and shows the confirmation', async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderForm({ fields: { predicted_total: 'optional' } });

    fillAlwaysFields();
    fireEvent.change(screen.getByLabelText(/Predicted total/), { target: { value: '512.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit entry' }));

    await waitFor(() => expect(screen.getByText('Entry submitted')).toBeInTheDocument());
    expect(submitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: COMP_ID,
        firstName: 'Jane',
        surname: 'Smith',
        gender: 'female',
        dateOfBirth: '1995-06-15',
        predictedTotalKg: 512.5,
        website: '',
      }),
    );
    // The form is gone — a double submit is impossible.
    expect(screen.queryByRole('button', { name: 'Submit entry' })).toBeNull();
  });

  it('collects the best comp total from the last 12 months when the design asks for it', async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderForm({ fields: { recent_best_total: 'optional' } });

    fillAlwaysFields();
    fireEvent.change(screen.getByLabelText(/Best comp total from the last 12 months/), {
      target: { value: '487.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit entry' }));

    await waitFor(() => expect(submitAction).toHaveBeenCalled());
    expect(submitAction.mock.calls[0]?.[0]?.recentBestTotalKg).toBe(487.5);

    // A blank input submits null, not NaN.
    cleanup();
    vi.clearAllMocks();
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderForm({ fields: { recent_best_total: 'optional' } });
    fillAlwaysFields();
    fireEvent.click(screen.getByRole('button', { name: 'Submit entry' }));
    await waitFor(() => expect(submitAction).toHaveBeenCalled());
    expect(submitAction.mock.calls[0]?.[0]?.recentBestTotalKg).toBeNull();
  });

  it('shows the server’s field and form errors instead of the confirmation', async () => {
    submitAction.mockResolvedValue({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { dateOfBirth: ['Date of birth cannot be in the future.'] },
    });
    renderForm();

    fillAlwaysFields();
    fireEvent.click(screen.getByRole('button', { name: 'Submit entry' }));

    await waitFor(() =>
      expect(screen.getByText('Date of birth cannot be in the future.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Please fix the highlighted fields.')).toBeInTheDocument();
    expect(screen.queryByText('Entry submitted')).toBeNull();
  });

  it('shows the disclaimer with its tick-box only when the design has one', () => {
    renderForm({ disclaimer: 'I am a current member.' });
    expect(screen.getByText('I am a current member.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I accept the above/ })).toBeInTheDocument();

    cleanup();
    renderForm();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('sends the disclaimer acceptance with the submission', async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderForm({ disclaimer: 'I am a current member.' });

    fillAlwaysFields();
    fireEvent.click(screen.getByRole('checkbox', { name: /I accept the above/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit entry' }));

    await waitFor(() => expect(submitAction).toHaveBeenCalled());
    expect(submitAction.mock.calls[0]?.[0]?.disclaimerAccepted).toBe(true);
  });

  it('uses the defaults shape end-to-end (sanity that the designer and form agree)', () => {
    renderForm({ fields: ENTRY_FORM_DEFAULTS.fields });
    expect(screen.getByLabelText(/Email address/)).toBeRequired();
    expect(screen.getByLabelText('Club')).not.toBeRequired();
  });
});
