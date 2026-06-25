/** Frontend mirror of the backend API contract (see ../../../../shared/types.ts). */

export type FilingStatus = 'single' | 'MFJ' | 'MFS' | 'HOH' | 'QW';
export type DeductionMethod = 'standard' | 'itemized';
export type LineRole =
  | 'income'
  | 'deduction'
  | 'credit'
  | 'tax'
  | 'payment'
  | 'total'
  | 'result'
  | 'subtotal'
  | 'meta';
export type Tier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type AnomalyType =
  | 'sign_flip'
  | 'missing_schedule'
  | 'missing_line'
  | 'vanished_income_source'
  | 'pct_variance_over_threshold'
  | 'absolute_dollar_jump'
  | 'new_schedule'
  | 'new_from_zero'
  | 'dropped_deduction'
  | 'dropped_carryover_or_depreciation'
  | 'ratio_proportion_anomaly'
  | 'filing_status_or_structural_change'
  | 'informational_change';

export interface LineValue {
  value: number | null;
}
export interface FormData {
  present: boolean;
  lines: Record<string, LineValue>;
}
export interface ReturnHeader {
  filing_status: FilingStatus;
  num_dependents: number;
  num_qualifying_children_ctc: number;
  deduction_method: DeductionMethod;
}
export interface TaxReturn {
  taxpayer_id: string;
  display_name: string;
  tax_year: number;
  header: ReturnHeader;
  forms: Record<string, FormData>;
}
export interface RegistryEntry {
  canonical_path: string;
  form: string;
  line: string;
  label: string;
  role: LineRole;
  flags?: string[];
}
export interface Citation {
  label: string;
  url?: string;
}
export interface Explanation {
  finding_id?: string;
  why_short: string;
  why_full?: string;
  suggested_action?: string;
  related_lines?: string[];
  citation?: Citation;
}
export interface Finding {
  finding_id: string;
  anomaly_type: AnomalyType;
  subtype?: string;
  form: string;
  line?: string;
  canonical_path: string;
  label: string;
  role?: LineRole;
  prior_value: number | null;
  current_value: number | null;
  pct: number | null;
  abs_delta: number | null;
  reasons: string[];
  severity: number;
  tier: Tier;
  context_refs?: string[];
  explanation?: Explanation | null;
}
export interface RuleSet {
  target?: string | null;
  pct_threshold: number;
  min_abs_dollars: number;
  enabled_types: AnomalyType[] | 'all';
  focus?: string[];
  max_findings?: number;
}
export interface ScanSummary {
  total: number;
  by_tier: Record<Tier, number>;
  suppressed: number;
}
export interface ScanResponse {
  scan_id: string;
  taxpayer_id: string;
  summary: ScanSummary;
  findings: Finding[];
  generated_at: string;
}
export interface ReturnPairResponse {
  taxpayer_id: string;
  display_name: string;
  tax_years: { prior: number; current: number };
  years?: number[];
  planted_anomalies?: string[];
  prior: TaxReturn;
  current: TaxReturn;
  line_registry: RegistryEntry[];
}
export interface AskResponse {
  answer: string;
  citation?: Citation;
  answered_via: 'claude' | 'deterministic';
}
export interface ParseRuleResponse {
  ruleset: RuleSet;
  resolved_taxpayer_id: string | null;
  echo_back: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  parsed_via: 'claude' | 'regex_fallback';
}
export interface ExplainResponse {
  explanations: Explanation[];
}
export interface HealthResponse {
  status: 'ok';
  claude_available: boolean;
  registry_version: string;
  available_taxpayers: string[];
}

/** Form tab metadata (mirror of backend FORM_META). */
export const FORM_META: Record<string, { label: string; short: string; order: number }> = {
  '1040': { label: 'Form 1040', short: '1040', order: 0 },
  Schedule1: { label: 'Schedule 1 — Adjustments', short: 'Sch 1', order: 1 },
  ScheduleA: { label: 'Schedule A — Itemized', short: 'Sch A', order: 2 },
  ScheduleB: { label: 'Schedule B — Interest & Dividends', short: 'Sch B', order: 3 },
  ScheduleC: { label: 'Schedule C — Business', short: 'Sch C', order: 4 },
  ScheduleD: { label: 'Schedule D — Capital Gains', short: 'Sch D', order: 5 },
  ScheduleE: { label: 'Schedule E — Rental/Pass-through', short: 'Sch E', order: 6 },
  ScheduleSE: { label: 'Schedule SE — Self-Employment Tax', short: 'Sch SE', order: 7 },
  Form8283: { label: 'Form 8283 — Noncash Charitable', short: '8283', order: 8 },
  Form8829: { label: 'Form 8829 — Home Office', short: '8829', order: 9 },
};

export const TIER_META: Record<Tier, { label: string; color: string; bg: string; icon: string }> = {
  CRITICAL: { label: 'Critical', color: '#B3261E', bg: '#FDECEA', icon: '!' },
  HIGH: { label: 'High', color: '#C2410C', bg: '#FFF1E6', icon: '▲' },
  MEDIUM: { label: 'Medium', color: '#A66A00', bg: '#FFF8E1', icon: '●' },
  LOW: { label: 'Low', color: '#475467', bg: '#F2F4F7', icon: '·' },
  INFO: { label: 'Info', color: '#3B6FB0', bg: '#EEF4FB', icon: 'i' },
};

export const TIER_ORDER: Tier[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}
export function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '';
  const pct = Math.round(p * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
