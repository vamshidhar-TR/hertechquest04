/**
 * Canonical domain + API contract types for CoCounsel Return-to-Return Variance Alerts.
 * Single source of truth shared by the Node/Express backend and (mirrored into) the Angular frontend.
 */

// ===================== Return data model =====================

export type FilingStatus = 'single' | 'MFJ' | 'MFS' | 'HOH' | 'QW';
export type DeductionMethod = 'standard' | 'itemized';

export interface ReturnHeader {
  filing_status: FilingStatus;
  num_dependents: number;
  /** Children that qualify for the Child Tax Credit (flow to Schedule 8812). */
  num_qualifying_children_ctc: number;
  deduction_method: DeductionMethod;
}

/** A single line item. value:null = not entered (drives missing/vanished); value:0 = a real zero. */
export interface LineValue {
  value: number | null;
}

export interface FormData {
  /** false = schedule absent from the return entirely. */
  present: boolean;
  lines: Record<string, LineValue>;
}

export interface TaxReturn {
  taxpayer_id: string;
  display_name: string;
  tax_year: number;
  header: ReturnHeader;
  /** Keyed by canonical form id: "1040", "ScheduleA", "ScheduleC", ... */
  forms: Record<string, FormData>;
}

// ===================== Static line registry =====================

export type LineRole =
  | 'income'
  | 'deduction'
  | 'credit'
  | 'tax'
  | 'payment'
  | 'total' // AGI / taxable income subtotals
  | 'result' // refund / amount owed
  | 'subtotal' // schedule subtotal
  | 'meta';

export interface RegistryEntry {
  /** "form.line", e.g. "1040.1a" or "ScheduleA.11". */
  canonical_path: string;
  form: string;
  line: string;
  label: string;
  role: LineRole;
  /** Behavioural flags, e.g. "always_material", "carryover", "depreciation", "monetary". */
  flags?: string[];
}

// ===================== Findings =====================

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
  /** Sub-threshold-but-notable change, surfaced as INFO context (e.g. an 11% raise under a 20% rule). */
  | 'informational_change';

export type Tier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface ScoreBreakdown {
  pct_component: number;
  abs_component: number;
  risk_weight: number;
}

export interface Explanation {
  why_short: string;
  why_full?: string;
  suggested_action?: string;
  related_lines?: string[];
}

export interface Finding {
  finding_id: string;
  anomaly_type: AnomalyType;
  subtype?: string;
  form: string;
  line?: string;
  canonical_path?: string;
  label: string;
  role?: LineRole;
  prior_value: number | null;
  current_value: number | null;
  /** Relative change (current-prior)/|prior|; null when prior is 0/absent. */
  pct: number | null;
  /** Absolute dollar magnitude of the change. */
  abs_delta: number | null;
  reasons: string[];
  /** 0-100 materiality score. */
  severity: number;
  tier: Tier;
  score_breakdown: ScoreBreakdown;
  /** finding_ids of structural/context findings this one relates to. */
  context_refs?: string[];
  explanation?: Explanation | null;
}

// ===================== RuleSet (alert config) =====================

export interface ThresholdOverride {
  pct_threshold?: number;
  min_abs_dollars?: number;
  disabled?: boolean;
}

export interface RuleSet {
  /** taxpayer_id this ruleset is scoped to, or null for "currently loaded". */
  target?: string | null;
  pct_threshold: number; // default 0.20
  min_abs_dollars: number; // default 500
  enabled_types: AnomalyType[] | 'all';
  type_overrides?: Partial<Record<AnomalyType, ThresholdOverride>>;
  /** keyed by canonical_path. */
  line_overrides?: Record<string, ThresholdOverride>;
  /** soft emphasis from phrases like "tell me what's missing" -> ["missing","dropped"]. */
  focus?: string[];
  max_findings?: number;
}

export const DEFAULT_RULESET: RuleSet = {
  target: null,
  pct_threshold: 0.2,
  min_abs_dollars: 500,
  enabled_types: 'all',
  max_findings: 15,
};

// ===================== API DTOs =====================

export interface NormalizedLine {
  canonical_path: string;
  form: string;
  line: string;
  label: string;
  role: LineRole;
  prior_value: number | null;
  current_value: number | null;
}

export interface ReturnPairResponse {
  taxpayer_id: string;
  display_name: string;
  tax_years: { prior: number; current: number };
  prior: TaxReturn;
  current: TaxReturn;
  line_registry: RegistryEntry[];
}

export interface ScanSummary {
  total: number;
  by_tier: Record<Tier, number>;
  suppressed: number;
}

export interface ScanRequest {
  taxpayer_id: string;
  /** edited current-year line values from the grid: { "1040.1a": 158000, ... } or partial TaxReturn. */
  current_override?: Record<string, number | null> | Partial<TaxReturn>;
  ruleset?: Partial<RuleSet>;
}

export interface ScanResponse {
  scan_id: string;
  taxpayer_id: string;
  summary: ScanSummary;
  findings: Finding[];
  generated_at: string;
}

export interface ParseRuleRequest {
  text: string;
  loaded_taxpayer_ids: string[];
}

export interface ParseRuleResponse {
  ruleset: RuleSet;
  resolved_taxpayer_id: string | null;
  echo_back: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  parsed_via: 'claude' | 'regex_fallback';
}

export interface ExplainRequest {
  taxpayer_id: string;
  findings: Finding[];
  context_findings?: Finding[];
  verbosity: 'card' | 'full';
}

export interface ExplainResponse {
  explanations: Array<{
    finding_id: string;
    why_short: string;
    why_full?: string;
    related_lines?: string[];
    suggested_action?: string;
  }>;
}

export interface HealthResponse {
  status: 'ok';
  claude_available: boolean;
  registry_version: string;
  available_taxpayers: string[];
}
