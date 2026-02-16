import type { SkillVaultManager } from './manager.js';

export async function discoveryService(manager: SkillVaultManager, query: string) {
  return manager.discover(query);
}
