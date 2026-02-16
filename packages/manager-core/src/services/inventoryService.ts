import type { SkillVaultManager } from './manager.js';
import type { InventoryQuery } from './manager.js';

export function inventoryService(manager: SkillVaultManager, query: InventoryQuery = {}) {
  return manager.inventory(query);
}
