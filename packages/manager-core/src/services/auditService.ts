import type { SkillVaultManager } from './manager.js';

export async function auditService(manager: SkillVaultManager, staleDays = 14) {
  return manager.audit(staleDays);
}
