import type { BenchReportOutput, BenchRunOutput } from '../bench/types.js';

export type InstallScope = 'project' | 'global';
export type InstallMode = 'copy' | 'symlink';

export interface AdapterSpec {
  id: string;
  displayName: string;
  projectPath: string;
  globalPath: string;
  detectionPaths: string[];
  manifestFilenames: string[];
  supportsSymlink: boolean;
  supportsGlobal: boolean;
  notes?: string;
}

export interface DeploymentResult {
  adapterId: string;
  installedPath: string;
  installMode: InstallMode;
  scope: InstallScope;
  status: 'deployed' | 'skipped' | 'failed';
  message?: string;
}

export type TrustVerdict = 'PASS' | 'WARN' | 'FAIL';

export interface SkillRecord {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceLocator: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  versionHash: string;
  manifestPath: string | null;
  bundleSha256: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface DeploymentRecord {
  id: string;
  skillVersionId: string;
  adapterId: string;
  installScope: InstallScope;
  installedPath: string;
  installMode: InstallMode;
  status: 'deployed' | 'failed' | 'removed';
  deployedAt: string;
  driftStatus: 'in_sync' | 'drifted' | 'missing_path';
}

export interface AuditSummary {
  totals: {
    skills: number;
    deployments: number;
    staleSkills: number;
    driftedDeployments: number;
  };
  staleSkills: SkillVersionRecord[];
  driftedDeployments: DeploymentRecord[];
}

export interface DiscoveryResult {
  installRef: string;
  url: string;
  installs?: number;
  title?: string;
}

export interface DiscoverySource {
  id: string;
  label: string;
  url: string;
  description: string;
  importHint: string;
}

export interface FilesystemInstallationRecord {
  adapterId: string;
  scope: InstallScope;
  installedPath: string;
  managedDeployment: boolean;
}

export interface FilesystemSkillRecord {
  skillId: string;
  name: string;
  sourceType: string | null;
  sourceLocator: string | null;
  versionHash: string | null;
  riskTotal: number | null;
  verdict: TrustVerdict | null;
  managed: boolean;
  installations: FilesystemInstallationRecord[];
}

export interface FilesystemInventory {
  totals: {
    managedSkills: number;
    unmanagedSkills: number;
    installations: number;
    adaptersScanned: number;
  };
  skills: FilesystemSkillRecord[];
}

export type TelemetryOutboxStatus = 'pending' | 'retry' | 'sent' | 'dead_letter' | 'skipped';

export interface TelemetryEvent {
  id: string;
  eventType: string;
  source: string;
  subjectType: string;
  subjectId: string | null;
  details: Record<string, unknown>;
  outboxStatus: TelemetryOutboxStatus;
  exportTarget: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface OutboxRecord extends TelemetryEvent {}

export interface EvalDataset {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvalCase {
  id: string;
  datasetId: string;
  caseKey: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  weight: number;
  createdAt: string;
}

export interface EvalRun {
  id: string;
  datasetId: string;
  baselineRunId: string | null;
  status: 'running' | 'completed' | 'failed';
  score: number;
  summary: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface EvalResult {
  id: string;
  runId: string;
  caseId: string;
  status: 'pass' | 'fail';
  score: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Permission {
  id: string;
  label: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Principal {
  id: string;
  name: string;
  type: 'user' | 'service';
  createdAt: string;
  updatedAt: string;
}

export interface ApiTokenRecord {
  id: string;
  principalId: string;
  label: string;
  roleName: string;
  tokenHash: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface BenchConfigEntry {
  id: string;
  name: string;
  path: string;
  source: 'workspace';
}

export interface BenchRunListEntry {
  runId: string;
  runPath: string;
  configPath: string;
  label: string | null;
  createdAt: string;
  deterministic: boolean;
  gitCommit: string | null;
  conditionPassRates: Record<string, number>;
  deltas: {
    curated_vs_no_skill: number | null;
    self_generated_vs_no_skill: number | null;
  };
}

export interface BenchRunServiceResult {
  runId: string;
  runPath: string;
  run: BenchRunOutput;
  report: BenchReportOutput;
  saved: boolean;
}

export interface DeployBlockedByTrustErrorShape {
  code: 'DEPLOY_BLOCKED_BY_TRUST';
  message: string;
  skillId: string;
  verdict: 'FAIL';
  riskTotal: number;
  overrideAllowed: boolean;
  remediation: string;
}
