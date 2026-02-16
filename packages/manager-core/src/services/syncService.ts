import type { SkillVaultManager } from './manager.js';

export async function syncService(manager: SkillVaultManager) {
  return manager.syncInstalledSkills();
}
