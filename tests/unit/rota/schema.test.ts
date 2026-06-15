import { describe, expect, it } from 'vitest';
import {
  rotaRoleCreateSchema,
  rotaSectionCreateSchema,
  rotaSignupSchema,
  rotaWithdrawalContactSchema,
  setRotaOpenSchema,
} from '@/types/rota';
import { MAX_ROTA_SLOT_CAPACITY } from '@/lib/constants';

const UUID = '00000000-0000-0000-0000-000000000000';

describe('setRotaOpenSchema', () => {
  it('accepts a boolean toggle', () => {
    expect(setRotaOpenSchema.safeParse({ competitionId: UUID, open: true }).success).toBe(true);
    expect(setRotaOpenSchema.safeParse({ competitionId: UUID, open: false }).success).toBe(true);
  });

  it('rejects a non-uuid competition and a non-boolean toggle', () => {
    expect(setRotaOpenSchema.safeParse({ competitionId: 'nope', open: true }).success).toBe(false);
    expect(setRotaOpenSchema.safeParse({ competitionId: UUID, open: 'yes' }).success).toBe(false);
  });
});

describe('rotaWithdrawalContactSchema', () => {
  it('keeps a contact line', () => {
    const result = rotaWithdrawalContactSchema.safeParse({
      competitionId: UUID,
      withdrawalContact: '  rota@club.org  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.withdrawalContact).toBe('rota@club.org');
    }
  });

  it('maps a blank contact line to null', () => {
    const result = rotaWithdrawalContactSchema.safeParse({ competitionId: UUID, withdrawalContact: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.withdrawalContact).toBeNull();
    }
  });

  it('rejects an over-long contact line', () => {
    const result = rotaWithdrawalContactSchema.safeParse({
      competitionId: UUID,
      withdrawalContact: 'x'.repeat(301),
    });
    expect(result.success).toBe(false);
  });
});

describe('rotaSectionCreateSchema', () => {
  const base = { competitionId: UUID, dayLabel: '', title: 'AM', subtitle: '' };

  it('accepts a section and maps blank optional fields to null', () => {
    const result = rotaSectionCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dayLabel).toBeNull();
      expect(result.data.subtitle).toBeNull();
      expect(result.data.title).toBe('AM');
    }
  });

  it('trims and keeps optional fields when given', () => {
    const result = rotaSectionCreateSchema.safeParse({
      ...base,
      dayLabel: ' Sat ',
      subtitle: ' Weigh-in 8–9:30 ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dayLabel).toBe('Sat');
      expect(result.data.subtitle).toBe('Weigh-in 8–9:30');
    }
  });

  it('rejects a blank title', () => {
    expect(rotaSectionCreateSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });
});

describe('rotaRoleCreateSchema', () => {
  const base = { competitionId: UUID, sectionId: UUID, title: 'Spotters / Loaders', arriveBy: '', capacity: 4 };

  it('accepts a role with a capacity and a blank arrive-by', () => {
    const result = rotaRoleCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.arriveBy).toBeNull();
      expect(result.data.capacity).toBe(4);
    }
  });

  it('rejects a non-positive, non-integer or over-large capacity', () => {
    expect(rotaRoleCreateSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(rotaRoleCreateSchema.safeParse({ ...base, capacity: 2.5 }).success).toBe(false);
    expect(rotaRoleCreateSchema.safeParse({ ...base, capacity: MAX_ROTA_SLOT_CAPACITY + 1 }).success).toBe(false);
  });

  it('rejects a blank role title', () => {
    expect(rotaRoleCreateSchema.safeParse({ ...base, title: '  ' }).success).toBe(false);
  });
});

describe('rotaSignupSchema', () => {
  const base = {
    competitionId: UUID,
    roleId: UUID,
    name: 'Mike R',
    email: 'mike@example.com',
    phone: '+44 7700 900000',
  };

  it('accepts a complete sign-up', () => {
    const result = rotaSignupSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Mike R');
      expect(result.data.email).toBe('mike@example.com');
    }
  });

  it('requires a name, a valid email and a mobile number', () => {
    expect(rotaSignupSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(rotaSignupSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(rotaSignupSchema.safeParse({ ...base, phone: '' }).success).toBe(false);
  });

  it('rejects a mobile number with letters but accepts common phone punctuation', () => {
    expect(rotaSignupSchema.safeParse({ ...base, phone: '07700 CALLME' }).success).toBe(false);
    expect(rotaSignupSchema.safeParse({ ...base, phone: '(0114) 555-1234' }).success).toBe(true);
  });

  it('accepts an absent honeypot and carries a tripped one through for the action to catch', () => {
    expect(rotaSignupSchema.safeParse(base).success).toBe(true);
    const tripped = rotaSignupSchema.safeParse({ ...base, website: 'http://spam' });
    expect(tripped.success).toBe(true);
    if (tripped.success) {
      expect(tripped.data.website).toBe('http://spam');
    }
  });
});
