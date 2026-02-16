import { createdAtIso, DETERMINISTIC_CREATED_AT_ISO } from '../util/determinism.js';

export { DETERMINISTIC_CREATED_AT_ISO };

export function nowIso(deterministic: boolean): string {
  return createdAtIso(deterministic);
}
