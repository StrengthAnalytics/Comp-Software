import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RotaDialog } from '@/components/rota/rota-dialog';
import { TOUCH_SCREEN_MEDIA_QUERY } from '@/lib/constants';

function stubTouchScreen(isTouch: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: isTouch && query === TOUCH_SCREEN_MEDIA_QUERY, media: query })),
  );
}

function renderForm() {
  return render(
    <RotaDialog title="Request a change" onClose={() => {}}>
      <label htmlFor="name">Your name</label>
      <input id="name" />
    </RotaDialog>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RotaDialog focus on open', () => {
  it('puts the cursor in the first text box with a mouse', () => {
    stubTouchScreen(false);
    renderForm();
    expect(screen.getByLabelText('Your name')).toHaveFocus();
  });

  it('focuses the dialog itself on a touch screen, so the keyboard does not open by itself', () => {
    stubTouchScreen(true);
    renderForm();
    expect(screen.getByRole('dialog', { name: 'Request a change' })).toHaveFocus();
  });

  it('still focuses a button on a touch screen, since a button opens no keyboard', () => {
    stubTouchScreen(true);
    render(
      <RotaDialog title="Remove helper" onClose={() => {}}>
        <button type="button">Remove</button>
      </RotaDialog>,
    );
    // The × close button comes first in the panel, so a dialog of only actions focuses it.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});
