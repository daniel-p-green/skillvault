import { describe, expect, it } from 'vitest';

import { canonicalJsonBytes, canonicalJsonStringify } from '../src/util/canonicalJson.js';
import { createdAtIso, DETERMINISTIC_CREATED_AT_ISO } from '../src/util/determinism.js';

describe('canonicalJson', () => {
  it('serializes nested objects with deterministic key ordering', () => {
    const input = {
      z: 1,
      a: {
        d: true,
        b: null,
        c: ['x', { y: 2, a: 1 }]
      },
      m: 'text'
    };

    const output = canonicalJsonStringify(input);
    expect(output).toBe('{"a":{"b":null,"c":["x",{"a":1,"y":2}],"d":true},"m":"text","z":1}');
  });

  it('produces byte-stable UTF-8 output for equivalent objects with different insertion order', () => {
    const a = { b: 2, a: { z: 9, y: 'é' } };
    const b = { a: { y: 'é', z: 9 }, b: 2 };

    const bytesA = canonicalJsonBytes(a);
    const bytesB = canonicalJsonBytes(b);

    expect(Array.from(bytesA)).toEqual(Array.from(bytesB));
    expect(new TextDecoder().decode(bytesA)).toBe('{"a":{"y":"é","z":9},"b":2}');
  });
});

describe('determinism clock', () => {
  it('returns a frozen created_at in deterministic mode', () => {
    expect(createdAtIso(true)).toBe(DETERMINISTIC_CREATED_AT_ISO);
  });

  it('returns a real ISO timestamp when deterministic mode is off', () => {
    const out = createdAtIso(false);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(out))).toBe(false);
  });
});
