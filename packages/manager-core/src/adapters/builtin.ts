import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AdapterSpec } from './types.js';

const HOME = os.homedir();
const CONFIG_HOME = process.env.XDG_CONFIG_HOME?.trim() || path.join(HOME, '.config');
const CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(HOME, '.codex');
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(HOME, '.claude');

export const OPENCLAW_FALLBACK_PATHS = [
  path.join(HOME, '.openclaw', 'skills'),
  path.join(HOME, '.clawdbot', 'skills'),
  path.join(HOME, '.moltbot', 'skills')
] as const;

type OptionalAdapterFields = Partial<Pick<AdapterSpec, 'manifestFilenames' | 'supportsSymlink' | 'supportsGlobal'>>;

function withDefaults(
  spec: Omit<AdapterSpec, 'manifestFilenames' | 'supportsSymlink' | 'supportsGlobal'> & OptionalAdapterFields
): AdapterSpec {
  return {
    manifestFilenames: ['SKILL.md', 'skill.md'],
    supportsSymlink: true,
    supportsGlobal: true,
    ...spec
  };
}

export function resolveOpenClawGlobalPath(existsFn: (candidate: string) => boolean = fs.existsSync): string {
  for (const candidate of OPENCLAW_FALLBACK_PATHS) {
    if (existsFn(candidate)) {
      return candidate;
    }
  }
  return OPENCLAW_FALLBACK_PATHS[0];
}

export const BUILTIN_ADAPTERS: AdapterSpec[] = [
  withDefaults({
    id: 'amp',
    displayName: 'Amp',
    projectPath: '.agents/skills',
    globalPath: path.join(CONFIG_HOME, 'agents', 'skills'),
    detectionPaths: [path.join(CONFIG_HOME, 'amp')]
  }),
  withDefaults({
    id: 'kimi-cli',
    displayName: 'Kimi Code CLI',
    projectPath: '.agents/skills',
    globalPath: path.join(CONFIG_HOME, 'agents', 'skills'),
    detectionPaths: [path.join(HOME, '.kimi')]
  }),
  withDefaults({
    id: 'replit',
    displayName: 'Replit',
    projectPath: '.agents/skills',
    globalPath: path.join(CONFIG_HOME, 'agents', 'skills'),
    detectionPaths: [path.join(process.cwd(), '.agents')]
  }),
  withDefaults({
    id: 'antigravity',
    displayName: 'Antigravity',
    projectPath: '.agent/skills',
    globalPath: path.join(HOME, '.gemini', 'antigravity', 'skills'),
    detectionPaths: [path.join(HOME, '.gemini', 'antigravity')]
  }),
  withDefaults({
    id: 'augment',
    displayName: 'Augment',
    projectPath: '.augment/skills',
    globalPath: path.join(HOME, '.augment', 'skills'),
    detectionPaths: [path.join(HOME, '.augment')]
  }),
  withDefaults({
    id: 'claude-code',
    displayName: 'Claude Code',
    projectPath: '.claude/skills',
    globalPath: path.join(CLAUDE_HOME, 'skills'),
    detectionPaths: [CLAUDE_HOME]
  }),
  withDefaults({
    id: 'openclaw',
    displayName: 'OpenClaw',
    projectPath: 'skills',
    globalPath: resolveOpenClawGlobalPath(),
    detectionPaths: [...OPENCLAW_FALLBACK_PATHS],
    notes: 'OpenClaw fallback order: ~/.openclaw/skills, ~/.clawdbot/skills, ~/.moltbot/skills.'
  }),
  withDefaults({
    id: 'cline',
    displayName: 'Cline',
    projectPath: '.cline/skills',
    globalPath: path.join(HOME, '.cline', 'skills'),
    detectionPaths: [path.join(HOME, '.cline')]
  }),
  withDefaults({
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    projectPath: '.codebuddy/skills',
    globalPath: path.join(HOME, '.codebuddy', 'skills'),
    detectionPaths: [path.join(HOME, '.codebuddy')]
  }),
  withDefaults({
    id: 'codex',
    displayName: 'Codex',
    projectPath: '.agents/skills',
    globalPath: path.join(CODEX_HOME, 'skills'),
    detectionPaths: [CODEX_HOME, '/etc/codex']
  }),
  withDefaults({
    id: 'command-code',
    displayName: 'Command Code',
    projectPath: '.commandcode/skills',
    globalPath: path.join(HOME, '.commandcode', 'skills'),
    detectionPaths: [path.join(HOME, '.commandcode')]
  }),
  withDefaults({
    id: 'continue',
    displayName: 'Continue',
    projectPath: '.continue/skills',
    globalPath: path.join(HOME, '.continue', 'skills'),
    detectionPaths: [path.join(HOME, '.continue')]
  }),
  withDefaults({
    id: 'crush',
    displayName: 'Crush',
    projectPath: '.crush/skills',
    globalPath: path.join(CONFIG_HOME, 'crush', 'skills'),
    detectionPaths: [path.join(CONFIG_HOME, 'crush')]
  }),
  withDefaults({
    id: 'cursor',
    displayName: 'Cursor',
    projectPath: '.cursor/skills',
    globalPath: path.join(HOME, '.cursor', 'skills'),
    detectionPaths: [path.join(HOME, '.cursor')]
  }),
  withDefaults({
    id: 'droid',
    displayName: 'Droid',
    projectPath: '.factory/skills',
    globalPath: path.join(HOME, '.factory', 'skills'),
    detectionPaths: [path.join(HOME, '.factory')]
  }),
  withDefaults({
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    projectPath: '.agents/skills',
    globalPath: path.join(HOME, '.gemini', 'skills'),
    detectionPaths: [path.join(HOME, '.gemini')]
  }),
  withDefaults({
    id: 'github-copilot',
    displayName: 'GitHub Copilot',
    projectPath: '.agents/skills',
    globalPath: path.join(HOME, '.copilot', 'skills'),
    detectionPaths: [path.join(HOME, '.copilot')]
  }),
  withDefaults({
    id: 'goose',
    displayName: 'Goose',
    projectPath: '.goose/skills',
    globalPath: path.join(CONFIG_HOME, 'goose', 'skills'),
    detectionPaths: [path.join(CONFIG_HOME, 'goose')]
  }),
  withDefaults({
    id: 'junie',
    displayName: 'Junie',
    projectPath: '.junie/skills',
    globalPath: path.join(HOME, '.junie', 'skills'),
    detectionPaths: [path.join(HOME, '.junie')]
  }),
  withDefaults({
    id: 'iflow-cli',
    displayName: 'iFlow CLI',
    projectPath: '.iflow/skills',
    globalPath: path.join(HOME, '.iflow', 'skills'),
    detectionPaths: [path.join(HOME, '.iflow')]
  }),
  withDefaults({
    id: 'kilo',
    displayName: 'Kilo Code',
    projectPath: '.kilocode/skills',
    globalPath: path.join(HOME, '.kilocode', 'skills'),
    detectionPaths: [path.join(HOME, '.kilocode')]
  }),
  withDefaults({
    id: 'kiro-cli',
    displayName: 'Kiro CLI',
    projectPath: '.kiro/skills',
    globalPath: path.join(HOME, '.kiro', 'skills'),
    detectionPaths: [path.join(HOME, '.kiro')]
  }),
  withDefaults({
    id: 'kode',
    displayName: 'Kode',
    projectPath: '.kode/skills',
    globalPath: path.join(HOME, '.kode', 'skills'),
    detectionPaths: [path.join(HOME, '.kode')]
  }),
  withDefaults({
    id: 'mcpjam',
    displayName: 'MCPJam',
    projectPath: '.mcpjam/skills',
    globalPath: path.join(HOME, '.mcpjam', 'skills'),
    detectionPaths: [path.join(HOME, '.mcpjam')]
  }),
  withDefaults({
    id: 'mistral-vibe',
    displayName: 'Mistral Vibe',
    projectPath: '.vibe/skills',
    globalPath: path.join(HOME, '.vibe', 'skills'),
    detectionPaths: [path.join(HOME, '.vibe')]
  }),
  withDefaults({
    id: 'mux',
    displayName: 'Mux',
    projectPath: '.mux/skills',
    globalPath: path.join(HOME, '.mux', 'skills'),
    detectionPaths: [path.join(HOME, '.mux')]
  }),
  withDefaults({
    id: 'opencode',
    displayName: 'OpenCode',
    projectPath: '.agents/skills',
    globalPath: path.join(CONFIG_HOME, 'opencode', 'skills'),
    detectionPaths: [path.join(CONFIG_HOME, 'opencode')]
  }),
  withDefaults({
    id: 'openhands',
    displayName: 'OpenHands',
    projectPath: '.openhands/skills',
    globalPath: path.join(HOME, '.openhands', 'skills'),
    detectionPaths: [path.join(HOME, '.openhands')]
  }),
  withDefaults({
    id: 'pi',
    displayName: 'Pi',
    projectPath: '.pi/skills',
    globalPath: path.join(HOME, '.pi', 'agent', 'skills'),
    detectionPaths: [path.join(HOME, '.pi', 'agent')]
  }),
  withDefaults({
    id: 'qoder',
    displayName: 'Qoder',
    projectPath: '.qoder/skills',
    globalPath: path.join(HOME, '.qoder', 'skills'),
    detectionPaths: [path.join(HOME, '.qoder')]
  }),
  withDefaults({
    id: 'qwen-code',
    displayName: 'Qwen Code',
    projectPath: '.qwen/skills',
    globalPath: path.join(HOME, '.qwen', 'skills'),
    detectionPaths: [path.join(HOME, '.qwen')]
  }),
  withDefaults({
    id: 'roo',
    displayName: 'Roo Code',
    projectPath: '.roo/skills',
    globalPath: path.join(HOME, '.roo', 'skills'),
    detectionPaths: [path.join(HOME, '.roo')]
  }),
  withDefaults({
    id: 'trae',
    displayName: 'Trae',
    projectPath: '.trae/skills',
    globalPath: path.join(HOME, '.trae', 'skills'),
    detectionPaths: [path.join(HOME, '.trae')]
  }),
  withDefaults({
    id: 'trae-cn',
    displayName: 'Trae CN',
    projectPath: '.trae/skills',
    globalPath: path.join(HOME, '.trae-cn', 'skills'),
    detectionPaths: [path.join(HOME, '.trae-cn')]
  }),
  withDefaults({
    id: 'windsurf',
    displayName: 'Windsurf',
    projectPath: '.windsurf/skills',
    globalPath: path.join(HOME, '.codeium', 'windsurf', 'skills'),
    detectionPaths: [path.join(HOME, '.codeium', 'windsurf')]
  }),
  withDefaults({
    id: 'zencoder',
    displayName: 'Zencoder',
    projectPath: '.zencoder/skills',
    globalPath: path.join(HOME, '.zencoder', 'skills'),
    detectionPaths: [path.join(HOME, '.zencoder')]
  }),
  withDefaults({
    id: 'neovate',
    displayName: 'Neovate',
    projectPath: '.neovate/skills',
    globalPath: path.join(HOME, '.neovate', 'skills'),
    detectionPaths: [path.join(HOME, '.neovate')]
  }),
  withDefaults({
    id: 'pochi',
    displayName: 'Pochi',
    projectPath: '.pochi/skills',
    globalPath: path.join(HOME, '.pochi', 'skills'),
    detectionPaths: [path.join(HOME, '.pochi')]
  }),
  withDefaults({
    id: 'adal',
    displayName: 'AdaL',
    projectPath: '.adal/skills',
    globalPath: path.join(HOME, '.adal', 'skills'),
    detectionPaths: [path.join(HOME, '.adal')]
  })
];
