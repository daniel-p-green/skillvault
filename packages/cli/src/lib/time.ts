export const DETERMINISTIC_CREATED_AT_ISO = '1970-01-01T00:00:00.000Z' as const;

export function nowIso(deterministic: boolean): string {
  return deterministic ? DETERMINISTIC_CREATED_AT_ISO : new Date().toISOString();
}
