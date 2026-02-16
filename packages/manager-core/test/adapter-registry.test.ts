import { describe, expect, it } from 'vitest';

import { BUILTIN_ADAPTERS, OPENCLAW_FALLBACK_PATHS, resolveOpenClawGlobalPath } from '../src/adapters/builtin.js';

describe('adapter registry', () => {
  it('contains skills.sh parity adapters requested for milestone one', () => {
    const ids = new Set(BUILTIN_ADAPTERS.map((adapter) => adapter.id));
    for (const id of ['codex', 'windsurf', 'openclaw', 'cursor', 'claude-code', 'qwen-code', 'roo']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('has openclaw fallback detection paths', () => {
    const openclaw = BUILTIN_ADAPTERS.find((adapter) => adapter.id === 'openclaw');
    expect(openclaw).toBeDefined();
    expect(openclaw?.detectionPaths).toEqual([...OPENCLAW_FALLBACK_PATHS]);
  });

  it('resolves openclaw fallback path in order of preference', () => {
    const checked: string[] = [];
    const resolved = resolveOpenClawGlobalPath((candidate) => {
      checked.push(candidate);
      return candidate === OPENCLAW_FALLBACK_PATHS[1];
    });
    expect(resolved).toBe(OPENCLAW_FALLBACK_PATHS[1]);
    expect(checked[0]).toBe(OPENCLAW_FALLBACK_PATHS[0]);
    expect(checked[1]).toBe(OPENCLAW_FALLBACK_PATHS[1]);
  });
});
