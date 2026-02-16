import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { ApiTokenRecord, Principal, Role } from '../adapters/types.js';
import { SkillVaultDb } from '../storage/db.js';

const VIEWER_PERMISSIONS = [
  'read:health',
  'read:adapters',
  'read:skills',
  'read:deployments',
  'read:audit',
  'read:discover',
  'read:telemetry',
  'read:evals',
  'read:rbac'
];

const OPERATOR_PERMISSIONS = [
  ...VIEWER_PERMISSIONS,
  'write:adapters',
  'write:skills',
  'write:deployments',
  'write:discover',
  'write:telemetry',
  'write:evals',
  'write:sync'
];

const ADMIN_PERMISSIONS = ['*'];

const DEFAULT_ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: 'viewer',
    description: 'Read-only API access for dashboards and reports',
    permissions: VIEWER_PERMISSIONS
  },
  {
    name: 'operator',
    description: 'Operational API access for import/deploy/audit workflows',
    permissions: OPERATOR_PERMISSIONS
  },
  {
    name: 'admin',
    description: 'Full API access including auth token management',
    permissions: ADMIN_PERMISSIONS
  }
];

export interface AuthSession {
  principalId: string;
  roleName: string;
  permissions: string[];
  tokenId: string;
}

export interface BootstrapAuthResult {
  principalId: string;
  roleName: string;
  token: string;
}

export class AuthService {
  constructor(
    private readonly db: SkillVaultDb,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  private randomToken(): string {
    return `svtok_${randomBytes(24).toString('hex')}`;
  }

  private ensureDefaultRoles(now: string): void {
    for (const role of DEFAULT_ROLES) {
      this.db.upsertRole({
        id: `role:${role.name}`,
        name: role.name,
        description: role.description,
        permissions_json: JSON.stringify(role.permissions),
        created_at: now,
        updated_at: now
      });
    }
  }

  listRoles(): Role[] {
    return this.db.listRoles().map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: JSON.parse(row.permissions_json) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  bootstrap(): BootstrapAuthResult {
    const now = this.nowIso();
    this.ensureDefaultRoles(now);

    const principalId = 'local-admin';
    this.db.upsertPrincipal({
      id: principalId,
      name: 'Local Admin',
      type: 'service',
      created_at: now,
      updated_at: now
    });

    const adminRole = this.db.getRoleByName('admin');
    if (!adminRole) {
      throw new Error('Unable to bootstrap auth: admin role missing');
    }
    this.db.assignPrincipalRole({
      id: randomUUID(),
      principal_id: principalId,
      role_id: adminRole.id,
      created_at: now
    });

    const token = this.randomToken();
    this.db.insertApiToken({
      id: randomUUID(),
      principal_id: principalId,
      label: 'bootstrap-admin',
      role_name: 'admin',
      token_hash: this.hashToken(token),
      is_active: 1,
      created_at: now,
      last_used_at: null,
      expires_at: null
    });

    return {
      principalId,
      roleName: 'admin',
      token
    };
  }

  createToken(input: {
    principalId: string;
    roleName: 'admin' | 'operator' | 'viewer';
    label?: string;
    expiresAt?: string;
  }): { token: string; record: ApiTokenRecord } {
    const now = this.nowIso();
    this.ensureDefaultRoles(now);

    const principal = this.db.getPrincipalById(input.principalId);
    if (!principal) {
      throw new Error(`Principal not found: ${input.principalId}`);
    }
    const role = this.db.getRoleByName(input.roleName);
    if (!role) {
      throw new Error(`Role not found: ${input.roleName}`);
    }
    this.db.assignPrincipalRole({
      id: randomUUID(),
      principal_id: principal.id,
      role_id: role.id,
      created_at: now
    });

    const token = this.randomToken();
    const tokenId = randomUUID();
    const tokenHash = this.hashToken(token);
    this.db.insertApiToken({
      id: tokenId,
      principal_id: principal.id,
      label: input.label ?? `${input.roleName}-token`,
      role_name: input.roleName,
      token_hash: tokenHash,
      is_active: 1,
      created_at: now,
      last_used_at: null,
      expires_at: input.expiresAt ?? null
    });

    return {
      token,
      record: {
        id: tokenId,
        principalId: principal.id,
        label: input.label ?? `${input.roleName}-token`,
        roleName: input.roleName,
        tokenHash,
        isActive: true,
        createdAt: now,
        lastUsedAt: null,
        expiresAt: input.expiresAt ?? null
      }
    };
  }

  getOrCreatePrincipal(input: { id: string; name: string; type: 'user' | 'service' }): Principal {
    const now = this.nowIso();
    this.db.upsertPrincipal({
      id: input.id,
      name: input.name,
      type: input.type,
      created_at: now,
      updated_at: now
    });
    return {
      id: input.id,
      name: input.name,
      type: input.type,
      createdAt: now,
      updatedAt: now
    };
  }

  resolveSession(token: string): AuthSession | null {
    const tokenHash = this.hashToken(token);
    const row = this.db.getActiveTokenByHash(tokenHash, this.nowIso());
    if (!row) return null;

    const role = this.db.getRoleByName(row.role_name);
    if (!role) return null;

    const permissions = JSON.parse(role.permissions_json) as string[];
    this.db.touchApiToken(row.id, this.nowIso());
    return {
      principalId: row.principal_id,
      roleName: row.role_name,
      permissions,
      tokenId: row.id
    };
  }

  authorize(token: string, permission: string): AuthSession | null {
    const session = this.resolveSession(token);
    if (!session) return null;
    if (session.permissions.includes('*') || session.permissions.includes(permission)) {
      return session;
    }
    return null;
  }
}
