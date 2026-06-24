/**
 * Materiality scoring + consolidation.
 *
 * Turns raw findings into a single ranked, de-noised alert list:
 *  - score: 0-100 severity = weighted blend of %-change, log-squashed $-magnitude, and a risk weight
 *  - floors: sign_flip / vanished_income never get buried (>=70)
 *  - consolidate: roll schedule "feeds" + dependent schedules + mirror lines into one card per issue
 *  - dedupe by line, sort by materiality, suppress noise below a cutoff, cap the list
 */
import type {
  AnomalyType,
  Finding,
  LineRole,
  RuleSet,
  ScanSummary,
  ScoreBreakdown,
  Tier,
} from '../../../shared/types.js';
import { DEFAULT_RULESET } from '../../../shared/types.js';
import { SCHEDULE_DEPENDS_ON, SCHEDULE_FEEDS } from '../registry.js';
import type { RawFinding } from './types.js';

const RISK_WEIGHTS: Record<AnomalyType, number> = {
  sign_flip: 1.0,
  vanished_income_source: 0.95,
  dropped_carryover_or_depreciation: 0.92,
  missing_schedule: 0.9,
  filing_status_or_structural_change: 0.9,
  new_schedule: 0.75,
  ratio_proportion_anomaly: 0.7,
  missing_line: 0.65,
  dropped_deduction: 0.65,
  absolute_dollar_jump: 0.6,
  pct_variance_over_threshold: 0.5,
  new_from_zero: 0.45,
  informational_change: 0.2,
};

const ROLE_MULT: Partial<Record<LineRole, number>> = {
  income: 0.1,
  result: 0.1,
  tax: 0.1,
  total: 0.05,
  credit: 0.05,
};

const W_PCT = 0.25;
const W_ABS = 0.35;
const W_RISK = 0.4;
const W_SUM = W_PCT + W_ABS + W_RISK;
const ABS_NORM = 250000;
const PCT_NORM = 1.0;

const TIER_CRITICAL = 75;
const TIER_HIGH = 55;
const TIER_MEDIUM = 35;
const SUPPRESS_CUTOFF = 30;
const INFO_SEVERITY_CAP = 25;

const FOCUS_MAP: Record<string, AnomalyType[]> = {
  missing: ['missing_schedule', 'missing_line', 'vanished_income_source'],
  dropped: ['dropped_deduction', 'dropped_carryover_or_depreciation'],
  variance: ['pct_variance_over_threshold', 'absolute_dollar_jump'],
  sign: ['sign_flip'],
  new: ['new_schedule', 'new_from_zero'],
};

interface Scored {
  raw: RawFinding;
  severity: number;
  breakdown: ScoreBreakdown;
  suppressed: boolean;
}

function score(raw: RawFinding): { severity: number; breakdown: ScoreBreakdown } {
  const pct_component = raw.pct === null ? 1.0 : Math.min(Math.abs(raw.pct) / PCT_NORM, 1.0);
  const absDelta = Math.abs(raw.abs_delta ?? 0);
  const abs_component = Math.min(Math.log10(1 + absDelta) / Math.log10(1 + ABS_NORM), 1.0);
  const risk_weight = Math.min(1.0, (RISK_WEIGHTS[raw.anomaly_type] ?? 0.5) + (ROLE_MULT[raw.role] ?? 0));
  const raw_score = W_PCT * pct_component + W_ABS * abs_component + W_RISK * risk_weight;
  let severity = Math.round((100 * raw_score) / W_SUM);
  if (raw.anomaly_type === 'sign_flip' || raw.anomaly_type === 'vanished_income_source') {
    severity = Math.max(severity, 70);
  }
  if (raw.anomaly_type === 'informational_change') {
    severity = Math.min(severity, INFO_SEVERITY_CAP);
  }
  return { severity, breakdown: { pct_component, abs_component, risk_weight } };
}

function tierOf(raw: RawFinding, severity: number): Tier {
  if (raw.anomaly_type === 'informational_change') return 'INFO';
  if (severity >= TIER_CRITICAL) return 'CRITICAL';
  if (severity >= TIER_HIGH) return 'HIGH';
  if (severity >= TIER_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function matchesFocus(type: AnomalyType, focus: string[]): boolean {
  return focus.some((k) => (FOCUS_MAP[k] ?? []).includes(type));
}

export function rankFindings(rawList: RawFinding[], ruleset?: Partial<RuleSet>): { findings: Finding[]; summary: ScanSummary } {
  const rs: RuleSet = { ...DEFAULT_RULESET, ...ruleset };

  const scored: Scored[] = rawList.map((raw) => {
    const s = score(raw);
    return { raw, severity: s.severity, breakdown: s.breakdown, suppressed: false };
  });

  const byPath = new Map<string, Scored[]>();
  for (const s of scored) {
    const arr = byPath.get(s.raw.canonical_path) ?? [];
    arr.push(s);
    byPath.set(s.raw.canonical_path, arr);
  }
  const scheduleFindings = scored.filter(
    (s) => s.raw.anomaly_type === 'missing_schedule' || s.raw.anomaly_type === 'new_schedule',
  );

  // (a) Feeds: roll the lines a schedule sources into the schedule's own card.
  for (const sf of scheduleFindings) {
    if (sf.suppressed) continue;
    for (const fedPath of SCHEDULE_FEEDS[sf.raw.form] ?? []) {
      for (const f of byPath.get(fedPath) ?? []) {
        if (f.suppressed || f === sf) continue;
        f.suppressed = true;
        sf.raw.reasons.push(`↳ ${f.raw.reasons[0] ?? f.raw.label}`);
        sf.raw.context_refs = [...(sf.raw.context_refs ?? []), f.raw.canonical_path];
        sf.severity = Math.max(sf.severity, f.severity);
      }
    }
  }

  // (b) Dependent schedule merges into its parent (no Sch C ⇒ no Sch SE).
  for (const [dep, parent] of Object.entries(SCHEDULE_DEPENDS_ON)) {
    const depF = scheduleFindings.find((s) => s.raw.form === dep && !s.suppressed);
    const parF = scheduleFindings.find((s) => s.raw.form === parent && !s.suppressed);
    if (depF && parF && depF.raw.anomaly_type === parF.raw.anomaly_type) {
      depF.suppressed = true;
      parF.raw.reasons.push(`↳ ${depF.raw.reasons[0] ?? `${dep} also affected`}`);
      for (let i = 1; i < depF.raw.reasons.length; i++) parF.raw.reasons.push(depF.raw.reasons[i]);
      parF.raw.context_refs = [
        ...(parF.raw.context_refs ?? []),
        depF.raw.canonical_path,
        ...(depF.raw.context_refs ?? []),
      ];
      parF.severity = Math.max(parF.severity, depF.severity);
    }
  }

  // (c) Dedupe by line: one card per canonical path (highest-risk type wins, reasons unioned).
  const survivors: Scored[] = [];
  for (const group of byPath.values()) {
    const live = group.filter((g) => !g.suppressed);
    if (live.length === 0) continue;
    if (live.length === 1) {
      survivors.push(live[0]);
      continue;
    }
    live.sort((a, b) => b.breakdown.risk_weight - a.breakdown.risk_weight || b.severity - a.severity);
    const primary = live[0];
    const reasons = new Set<string>(primary.raw.reasons);
    for (let i = 1; i < live.length; i++) {
      for (const r of live[i].raw.reasons) reasons.add(r);
      primary.severity = Math.max(primary.severity, live[i].severity);
    }
    primary.raw.reasons = [...reasons];
    survivors.push(primary);
  }

  // (d) Soft focus boost ("tell me what's missing").
  if (rs.focus?.length) {
    for (const s of survivors) {
      if (matchesFocus(s.raw.anomaly_type, rs.focus)) s.severity = Math.min(100, s.severity + 8);
    }
  }

  // (e) Suppress noise below the cutoff (info + always-material always kept).
  const kept: Scored[] = [];
  let suppressedCount = 0;
  for (const s of survivors) {
    const keepAlways = s.raw.anomaly_type === 'informational_change' || s.raw.flags.includes('always_material');
    if (!keepAlways && s.severity < SUPPRESS_CUTOFF) {
      suppressedCount++;
      continue;
    }
    kept.push(s);
  }

  // (f) Sort by materiality.
  kept.sort(
    (a, b) =>
      b.severity - a.severity ||
      (b.raw.abs_delta ?? 0) - (a.raw.abs_delta ?? 0) ||
      b.breakdown.risk_weight - a.breakdown.risk_weight,
  );

  // (g) Cap.
  const max = rs.max_findings ?? 15;
  if (kept.length > max) suppressedCount += kept.length - max;
  const capped = kept.slice(0, max);

  const findings: Finding[] = capped.map((s) => ({
    finding_id: s.raw.canonical_path,
    anomaly_type: s.raw.anomaly_type,
    subtype: s.raw.subtype,
    form: s.raw.form,
    line: s.raw.line,
    canonical_path: s.raw.canonical_path,
    label: s.raw.label,
    role: s.raw.role,
    prior_value: s.raw.prior_value,
    current_value: s.raw.current_value,
    pct: s.raw.pct,
    abs_delta: s.raw.abs_delta,
    reasons: s.raw.reasons,
    severity: s.severity,
    tier: tierOf(s.raw, s.severity),
    score_breakdown: s.breakdown,
    context_refs: s.raw.context_refs,
    explanation: null,
  }));

  const by_tier: Record<Tier, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) by_tier[f.tier]++;

  return { findings, summary: { total: findings.length, by_tier, suppressed: suppressedCount } };
}
