import { describe, expect, it } from 'vitest';
import type { Finding } from '../../shared/types.js';
import { getReturnPair } from '../src/data/index.js';
import { analyze } from '../src/engine/index.js';

const byPath = (findings: Finding[]) => new Map(findings.map((f) => [f.canonical_path, f]));

describe('Johnson return — six headline flags', () => {
  const pair = getReturnPair('JOHNSON')!;
  const { findings } = analyze(pair.prior, pair.current);
  const map = byPath(findings);

  it('1. missing Schedule C (CRITICAL)', () => {
    const f = map.get('ScheduleC')!;
    expect(f?.anomaly_type).toBe('missing_schedule');
    expect(f.tier).toBe('CRITICAL');
  });

  it('2. refund→owe sign flip (CRITICAL)', () => {
    const f = map.get('1040.37')!;
    expect(f?.anomaly_type).toBe('sign_flip');
    expect(f.subtype).toBe('refund_to_owe');
    expect(f.tier).toBe('CRITICAL');
  });

  it('3. dividends variance over threshold', () => {
    const f = map.get('1040.3b')!;
    expect(f?.anomaly_type).toBe('pct_variance_over_threshold');
    expect(f.pct).toBeLessThan(-0.5);
  });

  it('4. dropped charity deduction', () => {
    const f = map.get('ScheduleA.11')!;
    expect(f?.anomaly_type).toBe('dropped_deduction');
    expect(f.current_value).toBe(0);
  });

  it('5. itemized below standard deduction', () => {
    const f = map.get('1040.12')!;
    expect(f?.subtype).toBe('itemized_below_standard');
  });

  it('6. CTC off-by-one (structural, merged onto line 19)', () => {
    const f = map.get('1040.19')!;
    expect(f?.subtype).toBe('ctc_children');
    expect(f.prior_value).toBe(4000);
    expect(f.current_value).toBe(2000);
  });
});

describe('Johnson return — consolidation & noise control', () => {
  const pair = getReturnPair('JOHNSON')!;
  const { findings, summary } = analyze(pair.prior, pair.current);
  const map = byPath(findings);

  it('consolidates the Schedule C cascade into one card', () => {
    const c = map.get('ScheduleC')!;
    expect((c.context_refs ?? []).length).toBeGreaterThanOrEqual(3); // income + SE + SE tax + half-SE
    expect(map.has('ScheduleSE')).toBe(false); // dependent merged into Schedule C
    expect(map.has('1040.8')).toBe(false); // fed line rolled into Schedule C
    expect(map.has('1040.23')).toBe(false); // SE tax fed line rolled in
  });

  it('does not double-report mirror lines or aggregator schedules', () => {
    expect(map.has('ScheduleB.6')).toBe(false); // mirror of 1040.3b
    expect(map.has('ScheduleA.17')).toBe(false); // mirror of 1040.12
    expect(map.has('Schedule1')).toBe(false); // pure aggregator
  });

  it('shows wages +11% as INFO, never a high-severity flag', () => {
    const wages = map.get('1040.1a')!;
    expect(wages?.tier).toBe('INFO');
    expect(wages.severity).toBeLessThan(35);
  });

  it('ranks the most material item first', () => {
    expect(findings[0].tier).toBe('CRITICAL');
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1].severity).toBeGreaterThanOrEqual(findings[i].severity);
    }
  });

  it('produces a tidy panel (no runaway noise)', () => {
    expect(summary.total).toBeLessThanOrEqual(12);
    expect(summary.by_tier.CRITICAL).toBeGreaterThanOrEqual(2);
  });
});

describe('RuleSet wiring', () => {
  const pair = getReturnPair('JOHNSON')!;

  it('raising the threshold to 30% drops the 20% withholding flag but keeps dividends', () => {
    const { findings } = analyze(pair.prior, pair.current, { pct_threshold: 0.3 });
    const paths = new Set(findings.map((f) => f.canonical_path));
    expect(paths.has('1040.25')).toBe(false);
    expect(paths.has('1040.3b')).toBe(true);
  });

  it('editing the current value clears that line\'s flag', () => {
    const fresh = getReturnPair('JOHNSON')!;
    fresh.current.forms['1040'].lines['3b'] = { value: 3400 };
    const { findings } = analyze(fresh.prior, fresh.current);
    expect(findings.some((f) => f.canonical_path === '1040.3b')).toBe(false);
  });
});

describe('Smith return', () => {
  const pair = getReturnPair('SMITH')!;
  const map = byPath(analyze(pair.prior, pair.current).findings);

  it('flags the new Schedule C and the sign flip', () => {
    expect(map.get('ScheduleC')?.anomaly_type).toBe('new_schedule');
    expect(map.get('1040.37')?.anomaly_type).toBe('sign_flip');
  });
});

describe('seed data reconciles arithmetically', () => {
  for (const id of ['JOHNSON', 'SMITH']) {
    const pair = getReturnPair(id)!;
    for (const [label, r] of [
      ['prior', pair.prior],
      ['current', pair.current],
    ] as const) {
      it(`${id} ${label}: income lines sum to total income (L9)`, () => {
        const v = (l: string) => r.forms['1040'].lines[l]?.value ?? 0;
        expect(v('1a') + v('2b') + v('3b') + v('7') + v('8')).toBe(v('9'));
      });
      it(`${id} ${label}: total tax − payments = outcome`, () => {
        const v = (l: string) => r.forms['1040'].lines[l]?.value ?? 0;
        const net = v('33') - v('24');
        expect(net > 0 ? net : 0).toBe(v('34'));
        expect(net < 0 ? -net : 0).toBe(v('37'));
      });
    }
  }
});
