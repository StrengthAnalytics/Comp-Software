import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

// Sign-in only validates that a password was provided; strength is enforced at account creation
// (managed manually in Supabase for now), not here.
export const passwordSchema = z.string().min(1, 'Enter your password.');
