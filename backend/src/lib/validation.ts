import type { ZodError } from 'zod';

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const flattened = error.flatten().fieldErrors;
  const result: Record<string, string> = {};

  for (const [key, messages] of Object.entries(flattened)) {
    if (messages && messages[0]) {
      result[key] = messages[0];
    }
  }

  return result;
}
