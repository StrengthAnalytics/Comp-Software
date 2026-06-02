'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import {
  parseRecordsImport,
  recordNaturalKey,
  type ParsedRecordRow,
} from '@/lib/records/bulk-import';
import {
  recordDeleteSchema,
  recordInputSchema,
  recordUpdateSchema,
  type RecordInput,
  type RecordUpdateInput,
} from '@/types/record';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

// The natural-key columns the records table is unique on; used as the upsert conflict target.
const RECORD_CONFLICT_TARGET = 'region,gender,weight_class,age_category,lift,equipment';

// A record's category collides with an existing row (same region/gender/class/age/lift/equipment).
function mapRecordWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail(
      'A record already exists for that category. Edit the existing one instead.',
      { region: ['A record for this category already exists.'] },
    );
  }
  return fail('Could not save the record. Please try again.');
}

// Maps the validated camelCase input onto the snake_case table columns common to every write path.
// notes is added on top by the single-record path; the bulk path omits it so a re-import never wipes
// a note added through the editor.
function toRow(input: RecordInput) {
  return {
    region: input.region,
    name: input.name,
    gender: input.gender,
    weight_class: input.weightClass,
    age_category: input.ageCategory,
    lift: input.lift,
    equipment: input.equipment,
    weight_kg: input.weightKg,
    date_set: input.dateSet,
  };
}

export async function createRecordAction(input: RecordInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createRecord', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = recordInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('records')
      .insert({ ...toRow(parsed.data), notes: parsed.data.notes });

    if (error) {
      Sentry.captureException(error);
      return mapRecordWriteError(error);
    }

    return ok();
  });
}

export async function updateRecordAction(input: RecordUpdateInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateRecord', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = recordUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from('records')
      .update({ ...toRow(fields), notes: fields.notes })
      .eq('id', id);

    if (error) {
      Sentry.captureException(error);
      return mapRecordWriteError(error);
    }

    return ok();
  });
}

export async function deleteRecordAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteRecord', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = recordDeleteSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the record. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase.from('records').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the record. Please try again.');
    }

    return ok();
  });
}

export type BulkRecordOutcome = {
  line: number;
  label: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string | null;
};

export type BulkRecordSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  outcomes: BulkRecordOutcome[];
};

const MAX_IMPORT_CHARS = 1_000_000;
const UPSERT_CHUNK_SIZE = 500;

// A short human label for the outcome list, identifying the row's category.
function rowLabel(row: ParsedRecordRow): string {
  const parts = [row.region, row.name, row.weightClass, row.ageCategory].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(' · ') : `Line ${row.line}`;
}

// Bulk add/update records from a pasted sheet. Each row is upserted on its natural key, so a category
// that already exists is updated in place and a new one is inserted — the admin manages the whole
// dataset by paste rather than an in-code JSON file. Rows with validation errors are skipped and
// reported; unknown weight-class/age-category values import with a warning (the columns are free text).
export async function bulkUpsertRecordsAction(input: {
  text: string;
}): Promise<ActionResult<BulkRecordSummary>> {
  return Sentry.withServerActionInstrumentation('bulkUpsertRecords', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsedInput = z
      .object({ text: z.string().min(1).max(MAX_IMPORT_CHARS) })
      .safeParse(input);
    if (!parsedInput.success) {
      return fail('Nothing to import. Paste your records first.');
    }

    const rows = parseRecordsImport(parsedInput.data.text);
    if (rows.length === 0) {
      return fail('No rows found. Copy the headers, fill in your records, and paste the rows back.');
    }

    const supabase = await createClient();

    // Pre-fetch the existing natural keys so each row can be reported as created vs updated. The
    // dataset is small (a few thousand rows), so loading the keys once is cheap.
    const { data: existing, error: existingError } = await supabase
      .from('records')
      .select('region, gender, weight_class, age_category, lift, equipment');
    if (existingError) {
      Sentry.captureException(existingError);
      return fail('Could not load the existing records. Please try again.');
    }

    const existingKeys = new Set(
      (existing ?? []).map((row) =>
        recordNaturalKey({
          region: row.region,
          gender: row.gender,
          weightClass: row.weight_class,
          ageCategory: row.age_category,
          lift: row.lift,
          equipment: row.equipment,
        }),
      ),
    );

    const summary: BulkRecordSummary = { created: 0, updated: 0, skipped: 0, errors: 0, outcomes: [] };
    // Keyed by natural key so two pasted rows for the same category collapse to one write (last wins).
    // A multi-row upsert with two rows sharing the conflict target would otherwise be rejected by
    // Postgres ("ON CONFLICT DO UPDATE command cannot affect row a second time").
    const toWrite = new Map<string, ReturnType<typeof toRow>>();

    for (const row of rows) {
      const label = rowLabel(row);

      if (row.errors.length > 0) {
        summary.errors++;
        summary.outcomes.push({ line: row.line, label, status: 'error', message: row.errors.join(' ') });
        continue;
      }

      // The parser guarantees these are set when there are no errors; validate once more so the row is
      // normalised/rounded exactly like the single-record path before it is written.
      const validated = recordInputSchema.safeParse({
        region: row.region,
        name: row.name,
        gender: row.gender,
        weightClass: row.weightClass,
        ageCategory: row.ageCategory,
        lift: row.lift,
        equipment: row.equipment,
        weightKg: row.weightKg,
        dateSet: row.dateSet,
        notes: null,
      });
      if (!validated.success) {
        const fieldError = Object.values(toFieldErrors(validated.error))[0];
        summary.errors++;
        summary.outcomes.push({ line: row.line, label, status: 'error', message: fieldError?.[0] ?? 'Invalid record.' });
        continue;
      }

      const key = recordNaturalKey(validated.data);

      // A later row for a category already seen in this paste is a duplicate. The first occurrence is
      // the one written (a multi-row upsert can't touch the same conflict target twice), so report it
      // as skipped rather than double-counting it as another created/updated write.
      if (toWrite.has(key)) {
        summary.skipped++;
        summary.outcomes.push({
          line: row.line,
          label,
          status: 'skipped',
          message: 'Duplicate of an earlier row for the same category in this paste.',
        });
        continue;
      }

      const status: 'created' | 'updated' = existingKeys.has(key) ? 'updated' : 'created';
      toWrite.set(key, toRow(validated.data));
      summary[status]++;
      summary.outcomes.push({
        line: row.line,
        label,
        status,
        message: row.warnings.length > 0 ? row.warnings.join(' ') : null,
      });
    }

    // Upsert the de-duplicated valid rows in chunks on the natural key. toRow omits notes, so a
    // re-import never wipes a note added through the single-record editor.
    const rowsToWrite = [...toWrite.values()];
    for (let start = 0; start < rowsToWrite.length; start += UPSERT_CHUNK_SIZE) {
      const chunk = rowsToWrite.slice(start, start + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from('records').upsert(chunk, { onConflict: RECORD_CONFLICT_TARGET });
      if (error) {
        Sentry.captureException(error);
        return fail('Could not import the records. Please try again.');
      }
    }

    return ok(summary);
  });
}
