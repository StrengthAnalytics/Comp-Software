'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { toFieldErrors } from '@/lib/validation';
import { entryFormConfigSchema } from '@/types/entry-form';
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
