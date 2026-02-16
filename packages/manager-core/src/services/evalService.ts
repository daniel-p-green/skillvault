import type { SkillVaultManager } from './manager.js';

export async function evalSeedService(manager: SkillVaultManager, datasetId?: string) {
  return manager.seedEvalDataset(datasetId);
}

export async function evalRunService(
  manager: SkillVaultManager,
  opts: { datasetId: string; baselineRunId?: string; failOnRegression?: boolean }
) {
  return manager.runEval(opts);
}

export async function evalCompareService(manager: SkillVaultManager, runId: string) {
  return manager.compareEvalRun(runId);
}

