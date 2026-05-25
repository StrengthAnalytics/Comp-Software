import { z } from 'zod';
import type { FieldErrors } from '@/types/action-result';

// Flattens a ZodError into the FieldErrors shape the forms consume, dropping empty entries.
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const flattened = z.flattenError(error);
  const result: FieldErrors = {};

  for (const [key, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      result[key] = messages;
    }
  }

  return result;
}
