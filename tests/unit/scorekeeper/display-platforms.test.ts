import { describe, expect, it } from 'vitest';
import { resolveDisplayPlatform, UNASSIGNED_PLATFORM } from '@/lib/scorekeeper/display-platforms';
import type { BoardPlatform, BoardSession } from '@/lib/scorekeeper/board-types';

const platformA: BoardPlatform = { id: 'pA', name: 'Platform A' };
const platformB: BoardPlatform = { id: 'pB', name: 'Platform B' };

function session(id: string, platformId: string | null, sortOrder = 0): BoardSession {
  return { id, name: id, sortOrder, platformId };
}

describe('resolveDisplayPlatform', () => {
  it('returns no candidates and no selection when no session has a platform', () => {
    const { candidates, selected } = resolveDisplayPlatform([platformA, platformB], []);
    expect(candidates).toEqual([]);
    expect(selected).toBeUndefined();
  });

  it('only includes platforms that have at least one session', () => {
    const { candidates } = resolveDisplayPlatform(
      [platformA, platformB],
      [session('s1', 'pA')],
    );
    expect(candidates).toEqual([platformA]);
  });

  it('auto-selects the sole candidate', () => {
    const { selected } = resolveDisplayPlatform([platformA, platformB], [session('s1', 'pA')]);
    expect(selected).toEqual(platformA);
  });

  it('does not auto-select when several platforms are live and none is requested', () => {
    const { candidates, selected } = resolveDisplayPlatform(
      [platformA, platformB],
      [session('s1', 'pA'), session('s2', 'pB')],
    );
    expect(candidates).toEqual([platformA, platformB]);
    expect(selected).toBeUndefined();
  });

  it('selects the requested platform when it is a candidate', () => {
    const { selected } = resolveDisplayPlatform(
      [platformA, platformB],
      [session('s1', 'pA'), session('s2', 'pB')],
      'pB',
    );
    expect(selected).toEqual(platformB);
  });

  it('falls back to no selection for an unknown requested id when several are live', () => {
    const { selected } = resolveDisplayPlatform(
      [platformA, platformB],
      [session('s1', 'pA'), session('s2', 'pB')],
      'unknown',
    );
    expect(selected).toBeUndefined();
  });

  it('offers the synthetic unassigned platform for sessions with no platform', () => {
    const { candidates, selected } = resolveDisplayPlatform([platformA], [session('s1', null)]);
    // Only the unassigned bucket is live, so it auto-selects.
    expect(candidates).toEqual([UNASSIGNED_PLATFORM]);
    expect(selected).toEqual(UNASSIGNED_PLATFORM);
  });

  it('lists real platforms before the unassigned bucket when both are live', () => {
    const { candidates } = resolveDisplayPlatform(
      [platformA],
      [session('s1', 'pA'), session('s2', null)],
    );
    expect(candidates).toEqual([platformA, UNASSIGNED_PLATFORM]);
  });
});
