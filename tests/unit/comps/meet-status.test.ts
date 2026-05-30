import { describe, expect, it } from 'vitest';
import { canRecordMeetResults, isCompPubliclyVisible } from '@/lib/comps/meet-status';

describe('canRecordMeetResults', () => {
  it('allows meet-time writes for draft, published, and active comps', () => {
    expect(canRecordMeetResults('draft')).toBe(true);
    expect(canRecordMeetResults('published')).toBe(true);
    expect(canRecordMeetResults('active')).toBe(true);
  });

  it('locks meet-time writes once a comp is completed', () => {
    expect(canRecordMeetResults('completed')).toBe(false);
  });
});

describe('isCompPubliclyVisible', () => {
  it('hides a draft comp from the public/overlay/display surfaces', () => {
    expect(isCompPubliclyVisible('draft')).toBe(false);
  });

  it('shows published, active and completed comps (matching the is_comp_public RLS predicate)', () => {
    expect(isCompPubliclyVisible('published')).toBe(true);
    expect(isCompPubliclyVisible('active')).toBe(true);
    expect(isCompPubliclyVisible('completed')).toBe(true);
  });
});
