CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS principal_roles (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (principal_id) REFERENCES principals(id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  UNIQUE(principal_id, role_id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  label TEXT NOT NULL,
  role_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (principal_id) REFERENCES principals(id)
);

CREATE INDEX IF NOT EXISTS idx_principal_roles_principal ON principal_roles(principal_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_principal ON api_tokens(principal_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_active ON api_tokens(is_active);
