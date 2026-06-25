import { describe, expect, it } from 'vitest';
import type { Finding } from '../../shared/types.js';
import { getReturnPair } from '../src/data/index.js';
import { analyze } from '../src/engine/index.js';

const scan = (slug: string) => {
  const p = getReturnPair(slug);
  if (!p) throw new Error(`no client ${slug}`);
  return analyze(p.prior, p.current);
};
const pathsOf = (f: Finding[]) => new Set(f.map((x) => x.canonical_path));
const byType = (f: Finding[], t: string) => f.filter((x) => x.anomaly_type === t);

// The official kit ships these 5 clients; Garcia is the false-positive control.
describe('Garcia — control case (must raise ZERO alerts)', () => {
  it('produces no findings', () => {
    const { findings, summary } = scan('garcia');
    expect(findings.length).toBe(0);
    expect(summary.total).toBe(0);
  });
});

describe('Johnson — charitable drop + dropped schedules', () => {
  const { findings } = scan('johnson');
  const p = pathsOf(findings);

  it('flags the missing Schedule B and Form 8283', () => {
    expect(p.has('ScheduleB')).toBe(true);
    expect(p.has('Form8283')).toBe(true);
    expect(byType(findings, 'missing_schedule').length).toBeGreaterThanOrEqual(2);
  });

  it('flags the charitable cash collapse', () => {
    const c = findings.find((x) => x.canonical_path === 'ScheduleA.charitable_cash_sch_a');
    expect(c).toBeTruthy();
    expect(c!.pct!).toBeLessThan(-0.5);
  });
});

describe('Nguyen — business spike + missing home-office form', () => {
  const { findings } = scan('nguyen');
  const p = pathsOf(findings);

  it('flags the missing Form 8829', () => {
    expect(p.has('Form8829')).toBe(true);
  });

  it('flags the Schedule C receipts spike (large upward variance)', () => {
    const g = findings.find((x) => x.canonical_path === 'ScheduleC.gross_receipts_sch_c');
    expect(g).toBeTruthy();
    expect(g!.pct!).toBeGreaterThan(1.0); // ~+247%
  });
});

describe('Patel — within-form rental drop (Schedule E stays)', () => {
  const { findings } = scan('patel');
  const p = pathsOf(findings);

  it('flags property B rents going to zero', () => {
    expect(p.has('ScheduleE.rents_received_prop_b_sch_e')).toBe(true);
  });

  it('does NOT report Schedule E as a missing form (it is still present)', () => {
    expect(p.has('ScheduleE')).toBe(false);
    expect(byType(findings, 'missing_schedule').length).toBe(0);
  });
});

describe('Thompson — phased retirement (new income lines)', () => {
  const { findings } = scan('thompson');
  const p = pathsOf(findings);

  it('flags wages vanishing and Social Security appearing', () => {
    expect(p.has('1040.wages_1040_1a')).toBe(true);
    const ss = findings.find((x) => x.canonical_path === '1040.social_security_taxable_1040_6b');
    expect(ss?.anomaly_type).toBe('new_from_zero');
  });

  it('supports a chosen earlier comparison year (2023 -> 2024)', () => {
    const p2024 = getReturnPair('thompson', 2024)!;
    expect(p2024.prior.tax_year).toBe(2023);
    expect(p2024.current.tax_year).toBe(2024);
  });
});

describe('ranking + threshold wiring', () => {
  it('orders findings by descending severity', () => {
    const { findings } = scan('johnson');
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1].severity).toBeGreaterThanOrEqual(findings[i].severity);
    }
  });

  it('a 50% threshold drops smaller variances', () => {
    const p = getReturnPair('johnson')!;
    const base = analyze(p.prior, p.current).findings.length;
    const strict = analyze(p.prior, p.current, { pct_threshold: 0.5 }).findings.length;
    expect(strict).toBeLessThanOrEqual(base);
  });
});
