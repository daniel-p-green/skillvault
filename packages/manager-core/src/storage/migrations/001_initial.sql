CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL,
  source_locator TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version_hash TEXT NOT NULL,
  manifest_path TEXT,
  bundle_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  skill_version_id TEXT NOT NULL,
  risk_total INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  scanner_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (skill_version_id) REFERENCES skill_versions(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  skill_version_id TEXT NOT NULL,
  receipt_path TEXT NOT NULL,
  signature_alg TEXT,
  key_id TEXT,
  payload_sha256 TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (skill_version_id) REFERENCES skill_versions(id)
);

CREATE TABLE IF NOT EXISTS adapters (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  global_path TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  skill_version_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  install_scope TEXT NOT NULL,
  installed_path TEXT NOT NULL,
  install_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  drift_status TEXT NOT NULL,
  FOREIGN KEY (skill_version_id) REFERENCES skill_versions(id),
  FOREIGN KEY (adapter_id) REFERENCES adapters(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_version ON scan_runs(skill_version_id);
CREATE INDEX IF NOT EXISTS idx_deployments_version ON deployments(skill_version_id);
CREATE INDEX IF NOT EXISTS idx_deployments_adapter ON deployments(adapter_id);
