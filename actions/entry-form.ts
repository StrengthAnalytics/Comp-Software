'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { toFieldErrors } from '@/lib/validation';
import { buildSubmissionSchema, entryFormConfigSchema, parseEntryFormConfig } from '@/types/entry-form';
import { fail, ok, type ActionResult } from '@/types/action-result';

// The public entry form's admin actions: saving the comp's form design and opening/closing the
// form. Both are setup writes — deliberately not gated on competition status (ARCHITECTURE.md §7);
// what the *public* may do with the form is gated separately by comp_accepts_entries() in RLS.

const saveEntryFormDesignSchema = z.object({
  competitionId: z.uuid(),
  config: entryFormConfigSchema,
});

export type SaveEntryFormDesignInput = z.input<typeof saveEntryFormDesignSchema>;

export async function saveEntryFormDesignAction(
  input: SaveEntryFormDesignInput,
): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('saveEntryFormDesign', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = saveEntryFormDesignSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not save the form design. Please try again.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('competitions')
      .update({ entry_form: parsed.data.config })
      .eq('id', parsed.data.competitionId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the form design. Please try again.');
    }

    return ok();
  });
}

const setEntryFormOpenSchema = z.object({
  competitionId: z.uuid(),
  open: z.boolean(),
});

export type SetEntryFormOpenInput = z.infer<typeof setEntryFormOpenSchema>;

export async function setEntryFormOpenAction(input: SetEntryFormOpenInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('setEntryFormOpen', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = setEntryFormOpenSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not update the form. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('competitions')
      .update({ entry_form_open: parsed.data.open })
      .eq('id', parsed.data.competitionId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not update the form. Please try again.');
    }

    return ok();
  });
}

// --- The public submit ---------------------------------------------------------------------------

const FORM_CLOSED_MESSAGE = 'This competition is not accepting entries.';
const INBOX_FULL_MESSAGE =
  'Entries are temporarily full for this competition — please try again later or contact the organisers.';

// What the public form sends. Everything beyond the comp id is validated against the comp's own
// form design (buildSubmissionSchema), so the shape here is deliberately loose: unknown values are
// rejected or ignored by the schema, never trusted.
export type SubmitEntryFormInput = {
  competitionId: string;
  // Honeypot: a visually hidden field humans leave blank. A filled value means a bot — the action
  // reports success without storing anything, so the bot learns nothing.
  website?: string;
  firstName?: string;
  surname?: string;
  gender?: string;
  dateOfBirth?: string;
  club?: string;
  ipfMemberId?: string;
  division?: string;
  weightClass?: string;
  predictedTotalKg?: number | null;
  kitChoice?: string;
  eventChoice?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  disclaimerAccepted?: boolean;
};

// The app's one server action WITHOUT adminGuard() (see ARCHITECTURE.md §3/§7): a lifter submitting
// the public entry form. It runs on the visitor's own (anon) session, so RLS does the real gating —
// the comp row is only readable when publicly visible, the INSERT is only allowed while
// comp_accepts_entries() holds, and the database caps pending submissions per comp. Everything is
// validated against the comp's own form design before the insert.
export async function submitEntryFormAction(input: SubmitEntryFormInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('submitEntryForm', async () => {
    const competitionId = z.uuid().safeParse(input.competitionId);
    if (!competitionId.success) {
      return fail(FORM_CLOSED_MESSAGE);
    }

    const supabase = await createClient();

    // Anon can only read publicly visible comps, so a draft comp 404s here regardless of the toggle.
    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('id, status, entry_form, entry_form_open')
      .eq('id', competitionId.data)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not submit your entry. Please try again.');
    }
    if (!comp || !comp.entry_form_open || !isCompPubliclyVisible(comp.status)) {
      return fail(FORM_CLOSED_MESSAGE);
    }

    // Bot tripped the honeypot: claim success, store nothing.
    if (typeof input.website === 'string' && input.website.trim() !== '') {
      return ok();
    }

    const config = parseEntryFormConfig(comp.entry_form);
    const parsed = buildSubmissionSchema(config).safeParse({ ...input, competitionId: competitionId.data });
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    // A chosen weight class must be one of this comp's classes for the lifter's sex — the form offers
    // exactly those, so anything else is a stale page or a forged value.
    if (parsed.data.weightClass !== null && config.fields.weight_class !== 'off') {
      const { data: classes, error: classesError } = await supabase
        .from('weight_classes')
        .select('name, gender')
        .eq('competition_id', competitionId.data);
      if (classesError) {
        Sentry.captureException(classesError);
        return fail('Could not submit your entry. Please try again.');
      }
      const match = (classes ?? []).some(
        (weightClass) => weightClass.name === parsed.data.weightClass && weightClass.gender === parsed.data.gender,
      );
      if (!match) {
        return fail('Please fix the highlighted fields.', {
          weightClass: ['Choose a weight class from the list.'],
        });
      }
    }

    // No .select() on the insert: anon has no read on entry_submissions, by design.
    const { error } = await supabase.from('entry_submissions').insert({
      competition_id: competitionId.data,
      first_name: parsed.data.firstName,
      surname: parsed.data.surname,
      gender: parsed.data.gender,
      date_of_birth: parsed.data.dateOfBirth,
      club: parsed.data.club,
      ipf_member_id: parsed.data.ipfMemberId,
      division: parsed.data.division,
      weight_class: parsed.data.weightClass,
      predicted_total_kg: parsed.data.predictedTotalKg,
      kit_choice: parsed.data.kitChoice,
      event_choice: parsed.data.eventChoice,
      instagram: parsed.data.instagram,
      email: parsed.data.email,
      phone: parsed.data.phone,
      disclaimer_accepted_at: config.disclaimer === null ? null : new Date().toISOString(),
    });

    if (error) {
      // P0001 = the database's pending-submissions cap (raise exception in the insert trigger).
      if (error.code === 'P0001' && error.message.includes('entry_submissions_cap')) {
        return fail(INBOX_FULL_MESSAGE);
      }
      // 42501 = RLS denied: the form closed (or the comp unpublished) between page load and submit.
      if (error.code === '42501') {
        return fail(FORM_CLOSED_MESSAGE);
      }
      Sentry.captureException(error);
      return fail('Could not submit your entry. Please try again.');
    }

    return ok();
  });
}
