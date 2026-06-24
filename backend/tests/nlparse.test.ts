import { describe, expect, it } from 'vitest';
import { parseRule } from '../src/nlparse.js';

// These run the deterministic regex fallback (no API key in CI), which is the demo's default path.
describe('NL rule parsing (regex fallback)', () => {
  it('parses the canonical demo phrase', async () => {
    const r = await parseRule(
      "Flag anything on the Johnson return more than 20% different from last year, and tell me what's missing",
      ['JOHNSON', 'SMITH'],
    );
    expect(r.ruleset.pct_threshold).toBeCloseTo(0.2);
    expect(r.resolved_taxpayer_id).toBe('JOHNSON');
    expect(r.ruleset.focus).toContain('missing');
    expect(r.echo_back.toLowerCase()).toContain('johnson');
  });

  it('parses a dollar floor + dropped focus + a different taxpayer', async () => {
    const r = await parseRule('show me dropped deductions over $1,000 on the Smith return', ['JOHNSON', 'SMITH']);
    expect(r.ruleset.min_abs_dollars).toBe(1000);
    expect(r.ruleset.focus).toContain('dropped');
    expect(r.resolved_taxpayer_id).toBe('SMITH');
  });

  it('understands "a third"', async () => {
    const r = await parseRule('flag changes over a third', ['JOHNSON']);
    expect(r.ruleset.pct_threshold).toBeCloseTo(0.33);
  });

  it('defaults to 20% when unstated and resolves the only loaded taxpayer', async () => {
    const r = await parseRule('what changed this year', ['JOHNSON']);
    expect(r.ruleset.pct_threshold).toBeCloseTo(0.2);
    expect(r.resolved_taxpayer_id).toBe('JOHNSON');
  });

  it('flags refund→owe focus from "refund to owe"', async () => {
    const r = await parseRule('alert me to any refund to owe swings', ['JOHNSON']);
    expect(r.ruleset.focus).toContain('sign');
  });
});
