import { z } from 'zod';
import { roundToOneDecimal } from '@/lib/number-input';

// Lowercase letters, numbers and single hyphens; no leading, trailing or doubled hyphens.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Combining diacritical marks, stripped after NFKD normalisation so accented names slug cleanly.
const COMBINING_MARKS = /[̀-ͯ]/gu;

// Derives a URL-safe slug from free text. Strips diacritics, lowercases, and collapses any run of
// non-alphanumeric characters to a single hyphen.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replaceAll(COMBINING_MARKS, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .nullable(),
);

export const competitionInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required.')
      .max(80, 'Slug is too long.')
      .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and hyphens only.'),
    kit_type: z.enum(['classic', 'equipped']),
    event_type: z.enum(['full_power', 'bench_only', 'deadlift_only']),
    status: z.enum(['draft', 'published', 'active', 'completed']),
    starts_on: optionalDate,
    ends_on: optionalDate,
    is_team_competition: z.boolean().default(false),
  })
  .refine((data) => !data.starts_on || !data.ends_on || data.ends_on >= data.starts_on, {
    path: ['ends_on'],
    message: 'End date cannot be before the start date.',
  })
  .refine((data) => !data.is_team_competition || data.event_type === 'full_power', {
    path: ['is_team_competition'],
    message: 'Team competitions must be full power (squat, bench and deadlift).',
  });

export type CompetitionInput = z.infer<typeof competitionInputSchema>;

export const divisionInputSchema = z.object({
  competitionId: z.uuid(),
  name: z.string().trim().min(1, 'Name is required.').max(60, 'Name is too long.'),
  sortOrder: z.number().int().min(0).default(0),
});

export const divisionUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, 'Name is required.').max(60, 'Name is too long.'),
  sortOrder: z.number().int().min(0),
});

// numeric(5,1) in the schema: up to 9999.9, stored to one decimal place.
const weightKg = z
  .number()
  .min(0, 'Weight cannot be negative.')
  .max(9999.9, 'Weight is too large.')
  .transform(roundToOneDecimal);

export const weightClassInputSchema = z
  .object({
    competitionId: z.uuid(),
    name: z.string().trim().min(1, 'Name is required.').max(40, 'Name is too long.'),
    gender: z.enum(['male', 'female']),
    lowerKg: weightKg,
    upperKg: weightKg.nullable(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((data) => data.upperKg === null || data.upperKg > data.lowerKg, {
    path: ['upperKg'],
    message: 'Upper bound must be greater than the lower bound.',
  });

export const weightClassUpdateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1, 'Name is required.').max(40, 'Name is too long.'),
    gender: z.enum(['male', 'female']),
    lowerKg: weightKg,
    upperKg: weightKg.nullable(),
    sortOrder: z.number().int().min(0),
  })
  .refine((data) => data.upperKg === null || data.upperKg > data.lowerKg, {
    path: ['upperKg'],
    message: 'Upper bound must be greater than the lower bound.',
  });
