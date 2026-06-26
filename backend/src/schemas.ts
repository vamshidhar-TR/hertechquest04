/** RuleSet validation/normalization + the JSON Schema AI uses to emit a rule config. */
import type { AnomalyType, RuleSet } from '../../shared/types.js';
import { DEFAULT_RULESET } from '../../shared/types.js';

export const ALL_ANOMALY_TYPES: AnomalyType[] = [
  'sign_flip',
  'missing_schedule',
  'missing_line',
  'vanished_income_source',
  'pct_variance_over_threshold',
  'absolute_dollar_jump',
  'new_schedule',
  'new_from_zero',
  'dropped_deduction',
  'dropped_carryover_or_depreciation',
  'ratio_proportion_anomaly',
  'filing_status_or_structural_change',
  'informational_change',
];

export const FOCUS_KEYWORDS = ['missing', 'dropped', 'variance', 'sign', 'new'] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Validate + clamp + default-fill a partial ruleset into a complete, safe RuleSet. */
export function resolveRuleSet(partial?: Partial<RuleSet> | null): RuleSet {
  const p = partial ?? {};
  let enabled = p.enabled_types ?? 'all';
  if (Array.isArray(enabled)) {
    enabled = enabled.filter((t) => ALL_ANOMALY_TYPES.includes(t));
    if (enabled.length === 0) enabled = 'all';
  }
  return {
    target: p.target ?? null,
    pct_threshold: clamp(p.pct_threshold ?? DEFAULT_RULESET.pct_threshold, 0.01, 5),
    min_abs_dollars: Math.max(0, p.min_abs_dollars ?? DEFAULT_RULESET.min_abs_dollars),
    enabled_types: enabled,
    type_overrides: p.type_overrides,
    line_overrides: p.line_overrides,
    focus: Array.isArray(p.focus) ? p.focus.filter((f) => (FOCUS_KEYWORDS as readonly string[]).includes(f)) : undefined,
    max_findings: p.max_findings ? clamp(p.max_findings, 1, 100) : DEFAULT_RULESET.max_findings,
  };
}

/**
 * Input schema for the AI `emit_rule_config` tool. AI ONLY maps language → these enums;
 * it must not compute or invent thresholds (leave null). Deterministic code does the rest.
 */
export const RULESET_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    pct_threshold: {
      type: ['number', 'null'],
      description: 'Variance threshold as a fraction. "20% different" → 0.20, "more than a third" → 0.33. null if not specified.',
    },
    min_abs_dollars: {
      type: ['number', 'null'],
      description: 'Minimum dollar change to flag, e.g. "anything over $1,000" → 1000. null if not specified.',
    },
    enabled_types: {
      type: 'array',
      items: { type: 'string', enum: ALL_ANOMALY_TYPES },
      description: 'Only set if the user explicitly limited to specific anomaly types; otherwise leave empty (means all).',
    },
    focus: {
      type: 'array',
      items: { type: 'string', enum: [...FOCUS_KEYWORDS] },
      description: 'Soft emphasis. "tell me what is missing" → ["missing"]; "dropped deductions" → ["dropped"]; "refund to owe" → ["sign"].',
    },
    target_name: {
      type: ['string', 'null'],
      description: 'Taxpayer surname/name mentioned, e.g. "Johnson" from "the Johnson return". null if none.',
    },
  },
  required: ['pct_threshold', 'focus', 'target_name'],
};

/** Shape AI returns for emit_rule_config (before deterministic resolution). */
export interface RuleExtract {
  pct_threshold: number | null;
  min_abs_dollars: number | null;
  enabled_types?: AnomalyType[];
  focus?: string[];
  target_name?: string | null;
}
