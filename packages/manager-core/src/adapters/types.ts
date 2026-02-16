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
