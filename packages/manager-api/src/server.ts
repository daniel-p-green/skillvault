import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import type { InstallMode, InstallScope, TrustVerdict } from '@skillvault/manager-core';
import { SkillVaultManager } from '@skillvault/manager-core';

export interface CreateServerOptions {
  rootDir?: string;
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const manager = new SkillVaultManager(options.rootDir);

  app.register(cors, {
    origin: true
  });

  app.addHook('onReady', async () => {
    await manager.init();
  });

  app.addHook('onClose', async () => {
    await manager.close();
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/adapters', async () => ({ adapters: manager.listAdapters() }));

  app.get('/adapters/validate', async () => ({ issues: manager.validateAdapterPaths() }));

  app.post('/adapters/sync', async () => manager.syncAdapterSnapshot());

  app.post<{ Body: { id: string; enabled: boolean } }>('/adapters/toggle', async (request) => {
    return manager.setAdapterEnabled(request.body.id, request.body.enabled);
  });

  app.post<{ Body: { spec: unknown } }>('/adapters/override', async (request) => {
    return manager.addAdapterOverride(request.body.spec as any);
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

  app.get<{ Querystring: { staleDays?: string } }>('/audit/summary', async (request) => {
    const staleDaysRaw = Number(request.query.staleDays ?? 14);
    const staleDays = Number.isFinite(staleDaysRaw) && staleDaysRaw > 0 ? staleDaysRaw : 14;
    return manager.audit(staleDays);
  });

  app.post<{ Body: { query: string } }>('/discover', async (request) => ({
    results: await manager.discover(request.body.query)
  }));

  app.post('/sync', async () => manager.syncInstalledSkills());

  return app;
}

export async function startServer(opts: { port?: number; rootDir?: string } = {}): Promise<FastifyInstance> {
  const app = createServer({ rootDir: opts.rootDir });
  await app.listen({ port: opts.port ?? 4646, host: '127.0.0.1' });
  return app;
}
