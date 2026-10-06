import { describe, expect, it } from 'vitest';
import type { SessionForRota } from '@/lib/rota/generate';
import { arriveByForBasis, planRotaSync, type SyncRole, type SyncSection } from '@/lib/rota/sync-plan';

function session(id: string, overrides: Partial<SessionForRota> = {}): SessionForRota {
  return {
    id,
    name: id.toUpperCase(),
    session_date: '2026-06-13', // a Saturday
    weigh_in_time: '07:00:00',
    lift_off_time: '09:00:00',
    platform_id: null,
    sort_order: 0,
    ...overrides,
  };
}

function section(id: string, sessionId: string | null, sortOrder: number, overrides: Partial<SyncSection> = {}): SyncSection {
  return {
    id,
    session_id: sessionId,
    day_label: 'Sat',
    title: sessionId ? sessionId.toUpperCase() : 'Set-up',
    subtitle: sessionId ? 'Weigh-in 7:00am · Lift-off 9:00am' : 'Friday evening',
    sort_order: sortOrder,
    ...overrides,
  };
}

function role(id: string, sectionId: string, overrides: Partial<SyncRole> = {}): SyncRole {
  return {
    id,
    section_id: sectionId,
    title: 'MC',
    arrive_by: '8:30am',
    arrive_basis: 'lift_off',
    capacity: 1,
    sort_order: 0,
    ...overrides,
  };
}

const NO_PLATFORMS = new Map<string, string>();

describe('arriveByForBasis', () => {
  it('is 30 minutes before lift-off for the crew and 10 before weigh-in for the weigh-in team', () => {
    const times = { weigh_in_time: '07:00:00', lift_off_time: '09:00:00' };
    expect(arriveByForBasis('lift_off', times)).toBe('8:30am');
    expect(arriveByForBasis('weigh_in', times)).toBe('6:50am');
  });

  it('is null when the session time is not set', () => {
    expect(arriveByForBasis('lift_off', { weigh_in_time: '07:00', lift_off_time: null })).toBeNull();
    expect(arriveByForBasis('weigh_in', { weigh_in_time: null, lift_off_time: '09:00' })).toBeNull();
  });
});

describe('planRotaSync', () => {
  it('changes nothing when the rota already matches the sessions', () => {
    const plan = planRotaSync([session('am')], [section('s-am', 'am', 0)], [role('r1', 's-am')], NO_PLATFORMS);
    expect(plan).toEqual({ sectionUpdates: [], roleUpdates: [], newColumns: [] });
  });

  it('moves the column header and following jobs when a session’s times change', () => {
    const plan = planRotaSync(
      [session('am', { weigh_in_time: '08:00', lift_off_time: '10:00' })],
      [section('s-am', 'am', 0)],
      [
        role('r-mc', 's-am'),
        role('r-wi', 's-am', { title: 'Weigh-in', arrive_by: '6:50am', arrive_basis: 'weigh_in', sort_order: 1 }),
        role('r-fixed', 's-am', { title: 'Refreshments', arrive_by: '7:00am', arrive_basis: null, sort_order: 2 }),
      ],
      NO_PLATFORMS,
    );

    expect(plan.sectionUpdates).toEqual([
      { id: 's-am', day_label: 'Sat', title: 'AM', subtitle: 'Weigh-in 8:00am · Lift-off 10:00am', sort_order: 0 },
    ]);
    // The typed 7:00am is left alone.
    expect(plan.roleUpdates).toEqual([
      { id: 'r-mc', arrive_by: '9:30am' },
      { id: 'r-wi', arrive_by: '7:50am' },
    ]);
  });

  it('follows a renamed session and a changed day', () => {
    const plan = planRotaSync(
      [session('am', { name: 'Morning', session_date: '2026-06-14' })],
      [section('s-am', 'am', 0)],
      [],
      NO_PLATFORMS,
    );
    expect(plan.sectionUpdates).toEqual([
      { id: 's-am', day_label: 'Sun', title: 'Morning', subtitle: 'Weigh-in 7:00am · Lift-off 9:00am', sort_order: 0 },
    ]);
  });

  it('names the platform in the header when the comp runs more than one', () => {
    const plan = planRotaSync(
      [session('am', { platform_id: 'p1' })],
      [section('s-am', 'am', 0)],
      [],
      new Map([
        ['p1', 'Platform A'],
        ['p2', 'Platform B'],
      ]),
    );
    expect(plan.sectionUpdates[0]?.subtitle).toBe('Weigh-in 7:00am · Lift-off 9:00am · Platform A');
  });

  it('leaves hand-made columns and their jobs alone', () => {
    const plan = planRotaSync(
      [session('am', { lift_off_time: '11:00' })],
      [section('s-setup', null, 0), section('s-am', 'am', 1)],
      [role('r-setup', 's-setup', { title: 'Set-up', arrive_by: '8:00pm', arrive_basis: 'lift_off' })],
      NO_PLATFORMS,
    );
    expect(plan.sectionUpdates.map((update) => update.id)).toEqual(['s-am']);
    expect(plan.roleUpdates).toEqual([]);
  });

  it('keeps session columns in session order, leaving hand-made columns where they are', () => {
    const plan = planRotaSync(
      [session('am', { sort_order: 0 }), session('pm', { sort_order: 1 })],
      [section('s-pm', 'pm', 0), section('s-am', 'am', 1), section('s-setup', null, 2)],
      [],
      NO_PLATFORMS,
    );
    expect(plan.sectionUpdates).toEqual([
      expect.objectContaining({ id: 's-pm', sort_order: 1 }),
      expect.objectContaining({ id: 's-am', sort_order: 0 }),
    ]);
  });

  describe('a new session', () => {
    const sessions = [
      session('am', { sort_order: 0 }),
      session('pm2', { sort_order: 2, weigh_in_time: '15:00', lift_off_time: '17:00' }),
      session('sun', { sort_order: 3, session_date: '2026-06-14' }),
    ];
    const sections = [section('s-am', 'am', 0), section('s-sun', 'sun', 1), section('s-setup', null, 2)];
    const roles = [
      role('r-mc', 's-am'),
      role('r-wi', 's-am', { title: 'Weigh-in', arrive_by: '6:50am', arrive_basis: 'weigh_in', sort_order: 1 }),
      role('r-tea', 's-am', { title: 'Refreshments', arrive_by: '7:00am', arrive_basis: null, capacity: 2, sort_order: 2 }),
      role('r-sun', 's-sun'),
    ];

    it("gets a column copying the jobs of the session before it, with times from its own clock", () => {
      const plan = planRotaSync(sessions, sections, roles, NO_PLATFORMS, ['pm2']);

      expect(plan.newColumns).toEqual([
        {
          sessionId: 'pm2',
          dayLabel: 'Sat',
          title: 'PM2',
          subtitle: 'Weigh-in 3:00pm · Lift-off 5:00pm',
          sortOrder: 1,
          roles: [
            { title: 'MC', arrive_by: '4:30pm', arrive_basis: 'lift_off', capacity: 1, sort_order: 0 },
            { title: 'Weigh-in', arrive_by: '2:50pm', arrive_basis: 'weigh_in', capacity: 1, sort_order: 1 },
            { title: 'Refreshments', arrive_by: '7:00am', arrive_basis: null, capacity: 2, sort_order: 2 },
          ],
        },
      ]);
      // Sunday and Set-up shuffle along to make room.
      expect(plan.sectionUpdates).toEqual([
        expect.objectContaining({ id: 's-sun', sort_order: 2 }),
        expect.objectContaining({ id: 's-setup', sort_order: 3 }),
      ]);
    });

    it('copies the column after it when it is the first session', () => {
      const plan = planRotaSync(
        [session('early', { sort_order: -1 }), ...sessions],
        sections,
        roles,
        NO_PLATFORMS,
        ['early'],
      );
      expect(plan.newColumns).toHaveLength(1);
      expect(plan.newColumns[0]).toMatchObject({ sessionId: 'early', sortOrder: 0 });
      expect(plan.newColumns[0]?.roles.map((planned) => planned.title)).toEqual(['MC', 'Weigh-in', 'Refreshments']);
    });

    it('gets no column when the rota was never built from the sessions', () => {
      const plan = planRotaSync(sessions, [section('s-setup', null, 0)], [], NO_PLATFORMS, ['pm2']);
      expect(plan.newColumns).toEqual([]);
    });

    it('gets no column unless asked (a column the admin deleted stays deleted)', () => {
      const plan = planRotaSync(sessions, sections, roles, NO_PLATFORMS);
      expect(plan.newColumns).toEqual([]);
    });

    it('is not given a second column', () => {
      const plan = planRotaSync(sessions, sections, roles, NO_PLATFORMS, ['am']);
      expect(plan.newColumns).toEqual([]);
    });
  });
});
