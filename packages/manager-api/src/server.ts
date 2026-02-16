import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import type { InstallMode, InstallScope, TrustVerdict } from '@skillvault/manager-core';
import { SkillVaultManager } from '@skillvault/manager-core';
import { createAuthGuard, createSessionGuard } from './auth/middleware.js';

export interface CreateServerOptions {
  rootDir?: string;
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const manager = new SkillVaultManager(options.rootDir);
  const routePermissions = new Map<string, string>([
    ['GET /adapters', 'read:adapters'],
    ['GET /adapters/validate', 'read:adapters'],
    ['POST /adapters/sync', 'write:adapters'],
    ['POST /adapters/toggle', 'write:adapters'],
    ['POST /adapters/override', 'write:adapters'],
    ['GET /evals/datasets', 'read:evals'],
    ['POST /evals/datasets/seed', 'write:evals'],
    ['POST /evals/runs', 'write:evals'],
    ['GET /evals/runs/:id', 'read:evals'],
    ['GET /skills', 'read:skills'],
    ['GET /skills/filesystem', 'read:skills'],
    ['POST /skills/import', 'write:skills'],
    ['GET /skills/:id', 'read:skills'],
    ['POST /skills/:id/deploy', 'write:deployments'],
    ['POST /skills/:id/undeploy', 'write:deployments'],
    ['GET /deployments', 'read:deployments'],
    ['GET /telemetry/status', 'read:telemetry'],
    ['POST /telemetry/flush', 'write:telemetry'],
    ['GET /audit/summary', 'read:audit'],
    ['GET /discover/sources', 'read:discover'],
    ['POST /discover', 'write:discover'],
    ['POST /sync', 'write:sync'],
    ['GET /rbac/roles', 'read:rbac'],
    ['POST /auth/tokens', 'write:auth']
  ]);

  app.register(cors, {
    origin: true
  });

  app.addHook('onReady', async () => {
    await manager.init();
  });

  app.addHook('onClose', async () => {
    await manager.close();
  });

  app.addHook('preHandler', async (request, reply) => {
    const routeKey = `${request.method.toUpperCase()} ${request.routeOptions.url}`;
    const permission = routePermissions.get(routeKey);
    if (!permission) return;
    const guard = createAuthGuard(manager, permission);
    return guard(request, reply);
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/me', { preHandler: createSessionGuard(manager) }, async (request) => ({
    authMode: manager.authMode(),
    session: request.authSession ?? null
  }));

  app.get('/adapters', async () => ({ adapters: manager.listAdapters() }));

  app.get('/adapters/validate', async () => ({ issues: manager.validateAdapterPaths() }));

  app.post('/adapters/sync', async () => manager.syncAdapterSnapshot());

  app.post<{ Body: { id: string; enabled: boolean } }>('/adapters/toggle', async (request) => {
    return manager.setAdapterEnabled(request.body.id, request.body.enabled);
  });

  app.post<{ Body: { spec: unknown } }>('/adapters/override', async (request) => {
    return manager.addAdapterOverride(request.body.spec as any);
  });

  app.get('/evals/datasets', async () => ({ datasets: manager.listEvalDatasets() }));

  app.post<{ Body: { datasetId?: string } }>('/evals/datasets/seed', async (request) => {
    return manager.seedEvalDataset(request.body.datasetId);
  });

  app.post<{
    Body: {
      datasetId: string;
      baselineRunId?: string;
      failOnRegression?: boolean;
    };
  }>('/evals/runs', async (request) => {
    return manager.runEval({
      datasetId: request.body.datasetId,
      baselineRunId: request.body.baselineRunId,
      failOnRegression: request.body.failOnRegression
    });
  });

  app.get<{ Params: { id: string } }>('/evals/runs/:id', async (request, reply) => {
    const run = manager.getEvalRun(request.params.id);
    if (!run) {
      reply.code(404);
      return { error: 'Eval run not found' };
    }
    return run;
  });

  app.get<{
    Querystring: {
      risk?: TrustVerdict;
      adapter?: string;
      search?: string;
    };
  }>('/skills', async (request) => ({
    skills: manager.inventory({
      risk: request.query.risk,
      adapter: request.query.adapter,
      search: request.query.search
    })
  }));

  app.get('/skills/filesystem', async () => manager.filesystemInventory());

  app.post<{
    Body: {
      path: string;
      sourceType?: string;
      sourceLocator?: string;
    };
  }>('/skills/import', async (request) => {
    const { path: inputPath, sourceType, sourceLocator } = request.body;
    return manager.importSkill(inputPath, { sourceType, sourceLocator });
  });

  app.get<{ Params: { id: string } }>('/skills/:id', async (request, reply) => {
    const detail = manager.getSkillDetail(request.params.id);
    if (!detail) {
      reply.code(404);
      return { error: 'Skill not found' };
    }
    return detail;
  });

  app.post<{
    Params: { id: string };
    Body: { adapter: string; scope?: InstallScope; mode?: InstallMode };
  }>('/skills/:id/deploy', async (request) => {
    const scope = request.body.scope ?? 'project';
    const mode = request.body.mode ?? 'symlink';
    return manager.deploy(request.params.id, {
      adapter: request.body.adapter,
      scope,
      mode
    });
  });

  app.post<{
    Params: { id: string };
    Body: { adapter: string; scope?: InstallScope };
  }>('/skills/:id/undeploy', async (request) => {
    const scope = request.body.scope ?? 'project';
    return manager.undeploy(request.params.id, { adapter: request.body.adapter, scope });
  });

  app.get('/deployments', async () => ({ deployments: manager.listDeployments() }));

  app.get('/rbac/roles', async () => ({ roles: manager.listAuthRoles() }));

  app.post<{
    Body: {
      principalId: string;
      roleName: 'admin' | 'operator' | 'viewer';
      label?: string;
      expiresAt?: string;
    };
  }>('/auth/tokens', async (request) => {
    const created = await manager.createAuthToken({
      principalId: request.body.principalId,
      roleName: request.body.roleName,
      label: request.body.label,
      expiresAt: request.body.expiresAt
    });
    return {
      principalId: created.record.principalId,
      roleName: created.record.roleName,
      label: created.record.label,
      token: created.token
    };
  });

  app.get<{ Querystring: { limit?: string } }>('/telemetry/status', async (request) => {
    const limitRaw = Number(request.query.limit ?? 25);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
    return manager.telemetryStatus(limit);
  });

  app.post<{
    Body: {
      target?: 'jsonl' | 'weave';
      maxEvents?: number;
    };
  }>('/telemetry/flush', async (request) => {
    return manager.flushTelemetry({
      target: request.body.target ?? 'jsonl',
      maxEvents: request.body.maxEvents
    });
  });

  app.get<{ Querystring: { staleDays?: string } }>('/audit/summary', async (request) => {
    const staleDaysRaw = Number(request.query.staleDays ?? 14);
    const staleDays = Number.isFinite(staleDaysRaw) && staleDaysRaw > 0 ? staleDaysRaw : 14;
    return manager.audit(staleDays);
  });

  app.post<{ Body: { query: string } }>('/discover', async (request) => ({
    results: await manager.discover(request.body.query)
  }));

  app.get('/discover/sources', async () => ({
    sources: manager.listDiscoverySources()
  }));

  app.post('/sync', async () => manager.syncInstalledSkills());

  return app;
}

export async function startServer(opts: { port?: number; rootDir?: string } = {}): Promise<FastifyInstance> {
  const app = createServer({ rootDir: opts.rootDir });
  await app.listen({ port: opts.port ?? 4646, host: '127.0.0.1' });
  return app;
}
