import { describe, expect, it } from 'vitest';
import {
  buildSubmissionSchema,
  DISCLAIMER_MAX_LENGTH,
  ENTRY_FORM_DEFAULTS,
  entryFormConfigSchema,
  parseEntryFormConfig,
  type EntryFormConfig,
} from '@/types/entry-form';

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

function config(overrides?: {
  fields?: Partial<EntryFormConfig['fields']>;
  disclaimer?: string | null;
}): EntryFormConfig {
  return {
    fields: { ...ENTRY_FORM_DEFAULTS.fields, ...overrides?.fields },
    disclaimer: overrides?.disclaimer ?? null,
  };
}

// A submission that satisfies the always-collected fields; per-test cases override the rest.
const base = {
  competitionId: COMP_ID,
  firstName: 'Jane',
  surname: 'Smith',
  gender: 'female',
  dateOfBirth: '1995-06-15',
};

describe('parseEntryFormConfig', () => {
  it('reads the empty column default as the form defaults', () => {
    expect(parseEntryFormConfig({})).toEqual(ENTRY_FORM_DEFAULTS);
  });

  it.each([null, undefined, 'garbage', 42, ['off']])('falls back to defaults for %j', (value) => {
    expect(parseEntryFormConfig(value)).toEqual(ENTRY_FORM_DEFAULTS);
  });

  it('round-trips a stored design', () => {
    const stored = config({
      fields: { kit: 'required', instagram: 'optional', email: 'off' },
      disclaimer: 'I confirm I am a current member.',
    });
    expect(parseEntryFormConfig(structuredClone(stored))).toEqual(stored);
  });

  it('keeps the valid fields and defaults the corrupt ones', () => {
    const parsed = parseEntryFormConfig({
      fields: { club: 'required', division: 'mandatory', predicted_total: 7 },
      disclaimer: '   ',
    });
    expect(parsed.fields.club).toBe('required');
    expect(parsed.fields.division).toBe(ENTRY_FORM_DEFAULTS.fields.division);
    expect(parsed.fields.predicted_total).toBe(ENTRY_FORM_DEFAULTS.fields.predicted_total);
    expect(parsed.disclaimer).toBeNull();
  });

  it('truncates an over-long disclaimer instead of dropping it', () => {
    const parsed = parseEntryFormConfig({ disclaimer: 'x'.repeat(DISCLAIMER_MAX_LENGTH + 50) });
    expect(parsed.disclaimer).toHaveLength(DISCLAIMER_MAX_LENGTH);
  });
});

describe('entryFormConfigSchema', () => {
  it('accepts a complete design and nulls a blank disclaimer', () => {
    const parsed = entryFormConfigSchema.parse({
      fields: ENTRY_FORM_DEFAULTS.fields,
      disclaimer: '  ',
    });
    expect(parsed.disclaimer).toBeNull();
  });

  it('rejects an unknown field state', () => {
    const result = entryFormConfigSchema.safeParse({
      fields: { ...ENTRY_FORM_DEFAULTS.fields, club: 'mandatory' },
      disclaimer: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a design missing a field key', () => {
    const withoutClub: Record<string, unknown> = { ...ENTRY_FORM_DEFAULTS.fields };
    delete withoutClub.club;
    const result = entryFormConfigSchema.safeParse({ fields: withoutClub, disclaimer: null });
    expect(result.success).toBe(false);
  });
});

describe('buildSubmissionSchema — always-collected fields', () => {
  const schema = buildSubmissionSchema(config());

  it('accepts a minimal valid submission', () => {
    const parsed = schema.parse({ ...base, email: 'jane@example.com' });
    expect(parsed.firstName).toBe('Jane');
    expect(parsed.gender).toBe('female');
  });

  it('requires a first name and allows a blank surname (mononymous lifters)', () => {
    expect(schema.safeParse({ ...base, email: 'a@b.co', firstName: '  ' }).success).toBe(false);
    const parsed = schema.parse({ ...base, email: 'a@b.co', surname: '' });
    expect(parsed.surname).toBe('');
  });

  it('rejects a gender outside male/female', () => {
    expect(schema.safeParse({ ...base, email: 'a@b.co', gender: 'other' }).success).toBe(false);
  });

  it('rejects an impossible or future date of birth', () => {
    expect(schema.safeParse({ ...base, email: 'a@b.co', dateOfBirth: '1995-02-31' }).success).toBe(false);
    expect(schema.safeParse({ ...base, email: 'a@b.co', dateOfBirth: '2999-01-01' }).success).toBe(false);
  });
});

describe('buildSubmissionSchema — toggled fields', () => {
  it("a required field blocks submission when blank, with the field's message", () => {
    const schema = buildSubmissionSchema(config({ fields: { club: 'required', email: 'off' } }));
    const result = schema.safeParse({ ...base, club: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Enter your club.');
    }
  });

  it('an optional field stores blank as null', () => {
    const schema = buildSubmissionSchema(config({ fields: { email: 'off' } }));
    const parsed = schema.parse({ ...base, club: '  ' });
    expect(parsed.club).toBeNull();
  });

  it('a switched-off field is never stored, even when a value is sent', () => {
    const schema = buildSubmissionSchema(config({ fields: { phone: 'off', email: 'off' } }));
    const parsed = schema.parse({ ...base, phone: '07700 900000' });
    expect(parsed.phone).toBeNull();
  });

  it('division must be one of the BP divisions', () => {
    const schema = buildSubmissionSchema(config({ fields: { division: 'optional', email: 'off' } }));
    expect(schema.parse({ ...base, division: 'Wales' }).division).toBe('Wales');
    expect(schema.safeParse({ ...base, division: 'Narnia' }).success).toBe(false);
  });

  it('kit and event choices accept only their codes', () => {
    const schema = buildSubmissionSchema(
      config({ fields: { kit: 'required', event: 'required', email: 'off' } }),
    );
    const parsed = schema.parse({ ...base, kitChoice: 'equipped', eventChoice: 'bench_only' });
    expect(parsed.kitChoice).toBe('equipped');
    expect(parsed.eventChoice).toBe('bench_only');
    expect(schema.safeParse({ ...base, kitChoice: 'raw', eventChoice: 'bench_only' }).success).toBe(false);
    expect(schema.safeParse({ ...base, eventChoice: 'bench_only' }).success).toBe(false);
  });

  it('strips a pasted @ from the instagram handle and rejects junk', () => {
    const schema = buildSubmissionSchema(config({ fields: { instagram: 'optional', email: 'off' } }));
    expect(schema.parse({ ...base, instagram: '@jane.lifts' }).instagram).toBe('jane.lifts');
    expect(schema.parse({ ...base, instagram: '' }).instagram).toBeNull();
    expect(schema.safeParse({ ...base, instagram: 'jane lifts!' }).success).toBe(false);
  });

  it('requires a non-blank handle when instagram is required', () => {
    const schema = buildSubmissionSchema(config({ fields: { instagram: 'required', email: 'off' } }));
    expect(schema.safeParse({ ...base, instagram: '@' }).success).toBe(false);
    expect(schema.safeParse({ ...base }).success).toBe(false);
  });

  it('validates and bounds the email', () => {
    const schema = buildSubmissionSchema(config());
    expect(schema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(schema.safeParse({ ...base, email: '' }).success).toBe(false);
    const optional = buildSubmissionSchema(config({ fields: { email: 'optional' } }));
    expect(optional.parse({ ...base, email: '' }).email).toBeNull();
  });

  it('rounds the predicted total to 1 dp and rejects non-positive values', () => {
    const schema = buildSubmissionSchema(
      config({ fields: { predicted_total: 'required', email: 'off' } }),
    );
    expect(schema.parse({ ...base, predictedTotalKg: 512.55 }).predictedTotalKg).toBe(512.6);
    expect(schema.safeParse({ ...base, predictedTotalKg: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, predictedTotalKg: null }).success).toBe(false);
    const optional = buildSubmissionSchema(
      config({ fields: { predicted_total: 'optional', email: 'off' } }),
    );
    expect(optional.parse({ ...base, predictedTotalKg: null }).predictedTotalKg).toBeNull();
  });
});

describe('buildSubmissionSchema — disclaimer', () => {
  it('requires the tick when the form carries a disclaimer', () => {
    const schema = buildSubmissionSchema(
      config({ fields: { email: 'off' }, disclaimer: 'I am a current member.' }),
    );
    expect(schema.safeParse({ ...base }).success).toBe(false);
    expect(schema.safeParse({ ...base, disclaimerAccepted: false }).success).toBe(false);
    expect(schema.parse({ ...base, disclaimerAccepted: true }).disclaimerAccepted).toBe(true);
  });

  it('ignores the tick when there is no disclaimer', () => {
    const schema = buildSubmissionSchema(config({ fields: { email: 'off' } }));
    expect(schema.safeParse({ ...base }).success).toBe(true);
  });
});
