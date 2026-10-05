import { z } from 'zod';

// The public rota remembers a volunteer's name, email and mobile on their own device after they sign
// up once, so each further slot is a single tap ("Sign up as Sam?"). Stored only in this browser's
// localStorage — never sent anywhere until they sign up again — and forgettable from the board.

const STORAGE_KEY = 'rota-volunteer-details';

const rememberedSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().min(1),
});

export type RememberedVolunteer = z.infer<typeof rememberedSchema>;

// localStorage can throw (private-mode quirks, blocked site data) or be absent (server render).
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// The saved details, or null when there are none or the stored value is unreadable.
export function loadRememberedVolunteer(): RememberedVolunteer | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = rememberedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveRememberedVolunteer(details: RememberedVolunteer): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // Remembering is a convenience; a blocked write just means retyping next time.
  }
}

export function forgetRememberedVolunteer(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // As above: nothing to recover.
  }
}
