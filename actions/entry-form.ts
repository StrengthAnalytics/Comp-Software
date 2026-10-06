'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { requireAdmin } from '@/lib/auth/admin';
import { deriveAgeCategoryId, findLifterIdByName, matchWeightClassByName } from '@/lib/entries/registration';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { organiserReplyTo, sendEmail } from '@/lib/email/resend';
import { readOrganiserEmail } from '@/lib/email/organiser';
import { requestOrigin } from '@/lib/email/request-origin';
import {
  buildEntryAcceptedEmail,
  buildEntryReceivedEmail,
  buildEntryRejectedEmail,
  type EntryEmail,
  type EntryEmailComp,
} from '@/lib/entries/entry-emails';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { toFieldErrors } from '@/lib/validation';
import { ENTRY_FORM_EVENT_LABELS, ENTRY_FORM_KIT_LABELS } from '@/lib/constants';
import { buildSubmissionSchema, entryFormConfigSchema, parseEntryFormConfig } from '@/types/entry-form';
import { GENDER_VALUES } from '@/types/entry';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

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
  recentBestTotalKg?: number | null;
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
      .select('id, name, slug, starts_on, ends_on, status, entry_form, entry_form_open')
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
      recent_best_total_kg: parsed.data.recentBestTotalKg,
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

    // "We've got your entry", when the form collected an email. Nobody has checked the address yet,
    // so the receipt repeats only values from fixed lists (weight class, division, kit, event) —
    // never the name or club the submitter typed — and can't carry someone's own text to a stranger.
    // It is bounded like the submission itself (honeypot + the pending-submissions cap).
    if (parsed.data.email) {
      const { data: submitted } = parsed;
      await emailLifter(supabase, 'public', competitionId.data, parsed.data.email, (canReply, url) =>
        buildEntryReceivedEmail({
          comp: entryEmailComp(comp, url),
          weightClass: submitted.weightClass,
          division: submitted.division,
          kit: submitted.kitChoice === null ? null : ENTRY_FORM_KIT_LABELS[submitted.kitChoice],
          event: submitted.eventChoice === null ? null : ENTRY_FORM_EVENT_LABELS[submitted.eventChoice],
          canReply,
        }),
      );
    }

    return ok();
  });
}

// --- Emails to the lifter -------------------------------------------------------------------------

type EmailCompRow = { name: string; slug: string; starts_on: string | null; ends_on: string | null };

function entryEmailComp(comp: EmailCompRow, origin: string | null): EntryEmailComp {
  return {
    name: comp.name,
    startsOn: comp.starts_on,
    endsOn: comp.ends_on,
    url: origin ? `${origin}/${comp.slug}` : null,
  };
}

// Sends one email to a lifter after the response, so the submit/approve/reject never waits on (or
// fails because of) the mail: everything past reading the request's address runs in after(), inside
// a try/catch. Replies go to the comp's organiser email, else RESEND_REPLY_TO_EMAIL. Nothing happens
// until Resend is set up. A failure is logged with a generic error only — never the lifter's details.
async function emailLifter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: 'admin' | 'public',
  competitionId: string,
  to: string,
  build: (canReply: boolean, origin: string | null) => EntryEmail,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    return;
  }
  try {
    // Read while the request is still in scope; after() runs once the response has gone.
    const origin = await requestOrigin();
    after(async () => {
      try {
        const replyTo = organiserReplyTo(await readOrganiserEmail(supabase, competitionId, session));
        const email = build(replyTo !== undefined, origin);
        const result = await sendEmail({ to: [to], subject: email.subject, text: email.text, replyTo });
        if (result.status === 'failed') {
          Sentry.captureException(result.error);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

// --- Reviewing submissions ------------------------------------------------------------------------

const reviewSubmissionSchema = z.object({
  submissionId: z.uuid(),
  competitionId: z.uuid(),
});

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

// Approves a pending submission: runs the standard registration path — resolve-or-create the
// lifter (the same surname+first-name match the bulk importer uses), auto-assign the age category
// from the comp date and date of birth, resolve the chosen weight class to this comp's class row —
// then stamps the submission with the created entry and the reviewer. The submission's predicted
// total, kit/event preference, instagram and contact details stay on the (approved) submission as
// the admin's reference; they have no entry columns.
export async function approveSubmissionAction(input: ReviewSubmissionInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('approveSubmission', async () => {
    // requireAdmin directly (not adminGuard) because the reviewer's email is stamped on the row.
    let reviewer: string;
    try {
      reviewer = await requireAdmin();
    } catch {
      return fail('You need to be signed in as an admin to do that.');
    }

    const parsed = reviewSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not approve the entry. Please try again.');
    }

    const supabase = await createClient();

    const { data: submission, error: submissionError } = await supabase
      .from('entry_submissions')
      .select(
        'id, competition_id, status, first_name, surname, gender, date_of_birth, club, ipf_member_id, division, weight_class, email',
      )
      .eq('id', parsed.data.submissionId)
      .maybeSingle();
    if (submissionError) {
      Sentry.captureException(submissionError);
      return fail('Could not approve the entry. Please try again.');
    }
    if (!submission || submission.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that submission.');
    }
    if (submission.status !== 'pending') {
      return fail('This submission has already been reviewed.');
    }

    // The columns are CHECK-constrained, but they type as plain strings; narrow before writing to
    // the lifters table, which expects the same two values.
    const gender = z.enum(GENDER_VALUES).safeParse(submission.gender);
    if (!gender.success) {
      return fail('Could not approve the entry. Please try again.');
    }

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('name, slug, starts_on, ends_on')
      .eq('id', parsed.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not approve the entry. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (!comp.starts_on) {
      return fail('Set a competition date before approving entries — the age category is worked out from it.');
    }

    // Resolve the lifter the way every registration path does (shared findLifterIdByName, which
    // escapes the name — it is PUBLIC input here, so a submission named "%" must match literally,
    // never act as a wildcard onto someone else's row). An existing lifter with this name is the
    // same person (their details are refreshed from the submission), otherwise create them.
    const { lifterId: foundId, error: lookupError } = await findLifterIdByName(
      supabase,
      submission.first_name,
      submission.surname,
    );
    if (lookupError) {
      Sentry.captureException(lookupError);
      return fail('Could not approve the entry. Please try again.');
    }

    let lifterId: string;
    let createdLifter = false;

    if (foundId) {
      const { data: existingEntry, error: existingError } = await supabase
        .from('entries')
        .select('id')
        .eq('competition_id', parsed.data.competitionId)
        .eq('lifter_id', foundId)
        .maybeSingle();
      if (existingError) {
        Sentry.captureException(existingError);
        return fail('Could not approve the entry. Please try again.');
      }
      if (existingEntry) {
        return fail(
          'A lifter with this name is already registered in this competition. Reject the card if it is a duplicate.',
        );
      }

      // Refresh the persistent lifter from the submission — but only overwrite club/membership when
      // the form actually collected them, so a form that didn't ask can't blank existing details.
      const lifterUpdate: Database['public']['Tables']['lifters']['Update'] = {
        first_name: submission.first_name,
        surname: submission.surname,
        gender: gender.data,
        date_of_birth: submission.date_of_birth,
      };
      if (submission.club !== null) {
        lifterUpdate.club = submission.club;
      }
      if (submission.ipf_member_id !== null) {
        lifterUpdate.ipf_member_id = submission.ipf_member_id;
      }
      const { error: updateError } = await supabase.from('lifters').update(lifterUpdate).eq('id', foundId);
      if (updateError) {
        Sentry.captureException(updateError);
        return fail('Could not approve the entry. Please try again.');
      }
      lifterId = foundId;
    } else {
      const { data: created, error: insertError } = await supabase
        .from('lifters')
        .insert({
          first_name: submission.first_name,
          surname: submission.surname,
          gender: gender.data,
          date_of_birth: submission.date_of_birth,
          club: submission.club,
          ipf_member_id: submission.ipf_member_id,
        })
        .select('id')
        .single();
      if (insertError || !created) {
        Sentry.captureException(insertError);
        return fail('Could not approve the entry. Please try again.');
      }
      lifterId = created.id;
      createdLifter = true;
    }

    // Roll back a just-created lifter if registration fails below, so a retry can't duplicate them
    // (mirrors the New-lifter flow; the entries FK is ON DELETE RESTRICT so this only ever removes
    // an entry-less lifter).
    const rollbackLifter = async () => {
      if (!createdLifter) {
        return;
      }
      const { error: rollbackError } = await supabase.from('lifters').delete().eq('id', lifterId);
      if (rollbackError) {
        Sentry.captureException(rollbackError);
      }
    };

    // The comp's reference rows — two independent reads, fetched together. The age category is
    // derived from the comp year and birth year (shared deriveAgeCategoryId; a comp without the
    // computed band leaves it for the admin, same as every registration path), and the chosen
    // weight class is matched by name for the lifter's sex (shared matchWeightClassByName; a class
    // renamed since the submission is left blank for the admin rather than failing the approval).
    const [ageCategoriesResult, weightClassesResult] = await Promise.all([
      supabase.from('age_categories').select('id, name').eq('competition_id', parsed.data.competitionId),
      supabase.from('weight_classes').select('id, name, gender').eq('competition_id', parsed.data.competitionId),
    ]);
    if (ageCategoriesResult.error || weightClassesResult.error) {
      Sentry.captureException(ageCategoriesResult.error ?? weightClassesResult.error);
      await rollbackLifter();
      return fail('Could not approve the entry. Please try again.');
    }

    const ageCategoryId = deriveAgeCategoryId(
      ageCategoriesResult.data ?? [],
      comp.starts_on,
      submission.date_of_birth,
    );

    let weightClass: { id: string; name: string } | null = null;
    if (submission.weight_class !== null) {
      const match = matchWeightClassByName(
        weightClassesResult.data ?? [],
        submission.weight_class,
        gender.data,
      );
      weightClass = match.status === 'matched' ? match.weightClass : null;
    }

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .insert({
        competition_id: parsed.data.competitionId,
        lifter_id: lifterId,
        weight_class_id: weightClass?.id ?? null,
        age_category_id: ageCategoryId,
        division: submission.division,
      })
      .select('id')
      .single();
    if (entryError || !entry) {
      await rollbackLifter();
      if (entryError && isUniqueViolation(entryError)) {
        return fail('A lifter with this name is already registered in this competition.');
      }
      Sentry.captureException(entryError);
      return fail('Could not approve the entry. Please try again.');
    }

    const { error: stampError } = await supabase
      .from('entry_submissions')
      .update({
        status: 'approved',
        entry_id: entry.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer,
      })
      .eq('id', submission.id);
    if (stampError) {
      // The entry exists — the registration succeeded — but the card will stay in the inbox. Be
      // honest about the half-applied state rather than reporting clean success.
      Sentry.captureException(stampError);
      return fail(
        'The lifter was registered, but the submission could not be marked approved. Reject this card to clear it.',
      );
    }

    // "You're in", when the lifter gave an email on the form.
    if (submission.email) {
      const ageCategory = (ageCategoriesResult.data ?? []).find((category) => category.id === ageCategoryId);
      await emailLifter(supabase, 'admin', parsed.data.competitionId, submission.email, (canReply, origin) =>
        buildEntryAcceptedEmail({
          comp: entryEmailComp(comp, origin),
          firstName: submission.first_name,
          weightClass: weightClass?.name ?? null,
          ageCategory: ageCategory?.name ?? null,
          canReply,
        }),
      );
    }

    return ok();
  });
}

const rejectSubmissionSchema = reviewSubmissionSchema.extend({
  // Email the lifter to say their entry wasn't accepted (when they gave an email). Off for a
  // duplicate or junk card, which the admin unticks.
  notifyLifter: z.boolean().default(false),
});

export type RejectSubmissionInput = z.input<typeof rejectSubmissionSchema>;

// Rejects a pending submission. The row is kept (status 'rejected', stamped with the reviewer) as
// an audit record rather than deleted.
export async function rejectSubmissionAction(input: RejectSubmissionInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('rejectSubmission', async () => {
    let reviewer: string;
    try {
      reviewer = await requireAdmin();
    } catch {
      return fail('You need to be signed in as an admin to do that.');
    }

    const parsed = rejectSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not reject the entry. Please try again.');
    }

    const supabase = await createClient();
    const { data: rejected, error } = await supabase
      .from('entry_submissions')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer,
      })
      .eq('id', parsed.data.submissionId)
      .eq('competition_id', parsed.data.competitionId)
      .eq('status', 'pending')
      .select('id, first_name, email');

    if (error) {
      Sentry.captureException(error);
      return fail('Could not reject the entry. Please try again.');
    }
    if (!rejected || rejected.length === 0) {
      return fail('This submission has already been reviewed.');
    }

    const lifter = rejected[0];
    if (parsed.data.notifyLifter && lifter.email) {
      const { data: comp, error: compError } = await supabase
        .from('competitions')
        .select('name, slug, starts_on, ends_on')
        .eq('id', parsed.data.competitionId)
        .maybeSingle();
      if (compError || !comp) {
        // The rejection itself is saved; only the courtesy email is lost.
        Sentry.captureException(compError ?? new Error('Competition missing when emailing a rejected entry'));
        return ok();
      }
      await emailLifter(supabase, 'admin', parsed.data.competitionId, lifter.email, (canReply, origin) =>
        buildEntryRejectedEmail({ comp: entryEmailComp(comp, origin), firstName: lifter.first_name, canReply }),
      );
    }

    return ok();
  });
}
