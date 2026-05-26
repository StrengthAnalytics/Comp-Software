import { describe, expect, it } from 'vitest';
import { parseTeamNames } from '@/lib/teams/bulk-add';

describe('parseTeamNames', () => {
  it('reads one team name per line', () => {
    expect(parseTeamNames('City Barbell A\nCity Barbell B\nIron Temple')).toEqual([
      'City Barbell A',
      'City Barbell B',
      'Iron Temple',
    ]);
  });

  it('trims whitespace and drops blank lines', () => {
    expect(parseTeamNames('  Alpha  \n\n   \nBravo\n')).toEqual(['Alpha', 'Bravo']);
  });

  it('takes the first column when an extra one is pasted', () => {
    expect(parseTeamNames('Alpha\tsomething\nBravo\tother')).toEqual(['Alpha', 'Bravo']);
  });

  it('handles carriage returns', () => {
    expect(parseTeamNames('Alpha\r\nBravo')).toEqual(['Alpha', 'Bravo']);
  });

  it('returns an empty list for blank input', () => {
    expect(parseTeamNames('   \n  ')).toEqual([]);
  });
});
