import { describe, expect, it } from 'vitest';
import { buildRotaGrid, cellArriveBy, mostCommonArriveBy, type RotaGridRoleBase } from '@/lib/rota/grid';

type Role = RotaGridRoleBase;
type Section = {
  id: string;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
  roles: Role[];
};

function role(id: string, title: string, sortOrder: number, arriveBy: string | null = null): Role {
  return { id, title, arrive_by: arriveBy, sort_order: sortOrder };
}

function section(id: string, dayLabel: string | null, sortOrder: number, roles: Role[]): Section {
  return { id, day_label: dayLabel, title: id, subtitle: null, sort_order: sortOrder, roles };
}

describe('buildRotaGrid', () => {
  it('makes one column per section in sort order, grouped into day banners', () => {
    const grid = buildRotaGrid<Role, Section>([
      section('sun-am', 'Sun', 3, []),
      section('sat-am', 'Sat', 0, []),
      section('sat-pm', 'Sat', 1, []),
      section('setup', null, 4, []),
      section('sat-eve', 'Sat', 2, []),
    ]);
    expect(grid.columns.map((column) => column.section.id)).toEqual(['sat-am', 'sat-pm', 'sat-eve', 'sun-am', 'setup']);
    expect(grid.dayGroups).toEqual([
      { label: 'Sat', span: 3 },
      { label: 'Sun', span: 1 },
      { label: null, span: 1 },
    ]);
  });

  it('merges jobs with the same title into one row and aligns the cells', () => {
    const satMc = role('r1', 'MC', 0);
    const satRefs = role('r2', 'Refs', 1);
    const sunMc = role('r3', 'mc ', 0);
    const grid = buildRotaGrid<Role, Section>([
      section('sat', 'Sat', 0, [satRefs, satMc].map((r) => r)),
      section('sun', 'Sun', 1, [sunMc]),
    ]);
    expect(grid.rows.map((row) => row.title)).toEqual(['MC', 'Refs']);
    expect(grid.rows[0].cells).toEqual([satMc, sunMc]);
    expect(grid.rows[1].cells).toEqual([satRefs, null]);
  });

  it("slots a later column's new job in after the job it follows there", () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', null, 0, [role('a1', 'MC', 0), role('a2', 'Refs', 1)]),
      section('b', null, 1, [role('b1', 'MC', 0), role('b2', 'Livestream', 1), role('b3', 'Refs', 2)]),
    ]);
    expect(grid.rows.map((row) => row.title)).toEqual(['MC', 'Livestream', 'Refs']);
  });

  it('keeps the earlier order when a later column lists jobs differently', () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', null, 0, [role('a1', 'MC', 0), role('a2', 'Refs', 1)]),
      section('b', null, 1, [role('b1', 'Refs', 0), role('b2', 'MC', 1), role('b3', 'Tea', 2)]),
    ]);
    expect(grid.rows.map((row) => row.title)).toEqual(['MC', 'Refs', 'Tea']);
  });

  it('gives a repeated title within one column its own row', () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', null, 0, [role('a1', 'Weigh-in', 0), role('a2', 'Weigh-in', 1)]),
      section('b', null, 1, [role('b1', 'Weigh-in', 0)]),
    ]);
    expect(grid.rows.map((row) => row.key)).toEqual(['weigh-in', 'weigh-in#2']);
    expect(grid.rows[1].cells.map((cell) => cell?.id ?? null)).toEqual(['a2', null]);
  });

  it("sets each column's crew arrive-by to the time most of its roles share", () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', null, 0, [role('a1', 'MC', 0, '08:30'), role('a2', 'Refs', 1, '8:30am'), role('a3', 'Weigh-in', 2, '06:50')]),
    ]);
    expect(grid.columns[0].crewArriveBy).toBe('8:30am');
  });
});

describe('mostCommonArriveBy', () => {
  it('breaks a tie in favour of the first-listed time and ignores blanks', () => {
    expect(mostCommonArriveBy([role('1', 'A', 0, '9:00am'), role('2', 'B', 1, '10:00am'), role('3', 'C', 2, null)])).toBe(
      '9:00am',
    );
  });

  it('is null when no role has a time', () => {
    expect(mostCommonArriveBy([role('1', 'A', 0)])).toBeNull();
    expect(mostCommonArriveBy([])).toBeNull();
  });
});

describe('cellArriveBy', () => {
  it("returns a role's own time only when it differs from the crew time", () => {
    expect(cellArriveBy(role('1', 'MC', 0, '08:30'), '8:30am')).toBeNull();
    expect(cellArriveBy(role('1', 'Weigh-in', 0, '06:50'), '8:30am')).toBe('6:50am');
    expect(cellArriveBy(role('1', 'MC', 0, null), '8:30am')).toBeNull();
  });
});

describe('buildRotaGrid — row placement for new jobs', () => {
  it('puts a column made only of new jobs (a Set-up column) at the bottom', () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', 'Sat', 0, [role('a1', 'MC', 0), role('a2', 'Refs', 1)]),
      section('setup', null, 1, [role('s1', 'Set-up', 0)]),
    ]);
    expect(grid.rows.map((row) => row.title)).toEqual(['MC', 'Refs', 'Set-up']);
  });

  it('puts a new job that leads its column just before the next placed job', () => {
    const grid = buildRotaGrid<Role, Section>([
      section('a', null, 0, [role('a1', 'MC', 0), role('a2', 'Refs', 1)]),
      section('b', null, 1, [role('b1', 'Doors', 0), role('b2', 'Refs', 1)]),
    ]);
    expect(grid.rows.map((row) => row.title)).toEqual(['MC', 'Doors', 'Refs']);
  });
});
