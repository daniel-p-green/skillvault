import type { InstallMode, InstallScope } from '../adapters/types.js';
import type { SkillVaultManager } from './manager.js';

export async function deploymentService(
  manager: SkillVaultManager,
  skillId: string,
  opts: { adapter: string; scope: InstallScope; mode: InstallMode }
) {
  return manager.deploy(skillId, opts);
}

export async function undeploymentService(
  manager: SkillVaultManager,
  skillId: string,
  opts: { adapter: string; scope: InstallScope }
) {
  return manager.undeploy(skillId, opts);
}
