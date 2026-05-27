import { describe, expect, it } from 'vitest';
import { canRecordMeetResults } from '@/lib/comps/meet-status';

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
