import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthSession, SkillVaultManager } from '@skillvault/manager-core';

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
  }
}

function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match?.[1] ?? null;
}

export function createAuthGuard(manager: SkillVaultManager, permission: string) {
  return async function authGuard(request: FastifyRequest, reply: FastifyReply) {
    if (manager.authMode() === 'off') {
      return;
    }

    const token = readBearerToken(request);
    if (!token) {
      reply.code(401);
      return { error: 'Missing bearer token' };
    }

    const session = manager.authenticateToken(token);
    if (!session) {
      reply.code(401);
      return { error: 'Invalid token' };
    }

    if (!session.permissions.includes('*') && !session.permissions.includes(permission)) {
      reply.code(403);
      return { error: `Missing permission: ${permission}` };
    }

    request.authSession = session;
  };
}

export function createSessionGuard(manager: SkillVaultManager) {
  return async function sessionGuard(request: FastifyRequest, reply: FastifyReply) {
    if (manager.authMode() === 'off') {
      request.authSession = {
        principalId: 'anonymous',
        roleName: 'off',
        permissions: ['*'],
        tokenId: 'off'
      };
      return;
    }

    const token = readBearerToken(request);
    if (!token) {
      reply.code(401);
      return { error: 'Missing bearer token' };
    }

    const session = manager.authenticateToken(token);
    if (!session) {
      reply.code(401);
      return { error: 'Invalid token' };
    }
    request.authSession = session;
  };
}

