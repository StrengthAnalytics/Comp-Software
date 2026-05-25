// Standard return shape for server actions. Actions never throw raw DB errors at the UI; they
// resolve to this discriminated union so forms can render field-level and form-level messages.
export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = undefined> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string; fieldErrors?: FieldErrors };

export function ok<T = undefined>(data?: T): ActionResult<T> {
  // data is optional for the no-payload case; callers that declare a payload type always pass one.
  return { status: 'ok', data: data as T };
}

export function fail(message: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { status: 'error', message, fieldErrors };
}
