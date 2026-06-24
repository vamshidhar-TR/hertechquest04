import type { AnomalyType, LineRole } from '../../../shared/types.js';

/**
 * A finding as emitted by the detection pass — everything except the final materiality
 * score, tier, and id, which the ranking pass assigns.
 */
export interface RawFinding {
  anomaly_type: AnomalyType;
  subtype?: string;
  form: string;
  line?: string;
  /** "form.line" for line findings, the form id for schedule-level findings, "header.x" for structural. */
  canonical_path: string;
  label: string;
  role: LineRole;
  prior_value: number | null;
  current_value: number | null;
  pct: number | null;
  abs_delta: number | null;
  reasons: string[];
  /** registry flags carried for scoring (always_material, carryover, return_outcome, ...). */
  flags: string[];
  context_refs?: string[];
  /** True for structural context findings that are informative but not a primary alert. */
  is_context?: boolean;
}
