import type { SkillVaultManager } from './manager.js';

export async function importService(
  manager: SkillVaultManager,
  bundlePathOrZip: string,
  opts?: { sourceType?: string; sourceLocator?: string }
) {
  return manager.importSkill(bundlePathOrZip, opts);
}
