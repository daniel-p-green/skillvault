import { describe, expect, it } from 'vitest';

import { BenchConfigError, parseBenchConfig } from '../src/bench/config.js';

describe('benchmark config parser', () => {
  it('parses valid v1 benchmark config with defaults', () => {
    const config = parseBenchConfig(`
schema: skillvault.bench.config.v1

conditions:
  - id: no_skill
  - id: curated_skill
    bundle_path: ./curated
  - id: self_generated_skill
    adapter:
      id: stub
      options:
        bundle_path: ./self

tasks:
  - id: t1
    domain: docs
    timeout_ms: 500
    verifier:
      function: bundle_file_exists
      args:
        path: answer.txt
`);

    expect(config.schema).toBe('skillvault.bench.config.v1');
    expect(config.execution).toEqual({
      retries: 0,
      seed: 0,
      deterministic: false
    });
    expect(config.tasks[0]?.verifier.type).toBe('function');
  });

  it('rejects configs missing required conditions', () => {
    expect(() =>
      parseBenchConfig(`
schema: skillvault.bench.config.v1
conditions:
  - id: no_skill
  - id: curated_skill
tasks:
  - id: t1
    domain: docs
    timeout_ms: 100
    verifier:
      command: "echo ok"
`)
    ).toThrow(BenchConfigError);
  });

  it('rejects non-positive timeout values', () => {
    expect(() =>
      parseBenchConfig(`
schema: skillvault.bench.config.v1
conditions:
  - id: no_skill
  - id: curated_skill
  - id: self_generated_skill
    adapter:
      id: stub
      options:
        bundle_path: ./self
tasks:
  - id: t1
    domain: docs
    timeout_ms: 0
    verifier:
      command: "echo ok"
`)
    ).toThrow(BenchConfigError);
  });

  it('rejects self_generated_skill without bundle_path or stub adapter', () => {
    expect(() =>
      parseBenchConfig(`
schema: skillvault.bench.config.v1
conditions:
  - id: no_skill
  - id: curated_skill
  - id: self_generated_skill
tasks:
  - id: t1
    domain: docs
    timeout_ms: 100
    verifier:
      command: "echo ok"
`)
    ).toThrow(BenchConfigError);
  });
});
