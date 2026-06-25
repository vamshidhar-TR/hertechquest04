/**
 * Deterministic two-return detection pass.
 *
 * Walks a prior and current return, classifies every change into an anomaly type, and emits
 * RawFindings. No LLM, no scoring here — purely the "what changed and how" layer. Ranking,
 * materiality scoring, and consolidation (mirror/feeds/rollup) happen in rank.ts.
 */
import type { AnomalyType, LineRole, RuleSet, TaxReturn } from '../../../shared/types.js';
import { DEFAULT_RULESET } from '../../../shared/types.js';
import {
  flagsFor,
  formLabel,
  isNoEmit,
  labelFor,
  mirrorOf,
  PRESENCE_EXEMPT_FORMS,
  RATIO_DEFS,
  roleFor,
  SCHEDULE_PRIMARY,
  splitPath,
  standardDeduction,
} from '../registry.js';
import type { RawFinding } from './types.js';
import { fmtMoney, fmtPct } from './util.js';

// ---- Detection tuning (configurable defaults) ----
/** A large absolute swing flags even when the % is small. Floors are deliberately high so a
 *  benign raise (e.g. +$16k wages) does NOT trip — abs_jump is for genuinely big moves. */
const ABS_JUMP_FLOORS: Record<LineRole, number> = {
  income: 20000,
  deduction: 20000,
  credit: 15000,
  tax: 30000,
  payment: 30000,
  total: 50000,
  result: 50000,
  subtotal: 30000,
  meta: Number.POSITIVE_INFINITY,
};
/** Sub-threshold changes between half-threshold and threshold surface as INFO context. */
const INFO_PCT_FRACTION = 0.5;
const INFO_MIN_ABS = 2000;
const INFO_ROLES: LineRole[] = ['income', 'total', 'result', 'tax', 'deduction', 'credit'];
const INCOME_VANISH_FLOOR = 1000;

interface Flat {
  values: Map<string, number | null>;
  /** forms marked present:true AND carrying at least one non-zero line. */
  withData: Set<string>;
}

function flatten(ret: TaxReturn): Flat {
  const values = new Map<string, number | null>();
  const withData = new Set<string>();
  for (const [formId, form] of Object.entries(ret.forms)) {
    let hasData = false;
    for (const [line, lv] of Object.entries(form.lines)) {
      values.set(`${formId}.${line}`, lv.value);
      if (lv.value !== null && lv.value !== 0) hasData = true;
    }
    if (form.present && hasData) withData.add(formId);
  }
  return { values, withData };
}

function resolve(rs: RuleSet, path: string, type: AnomalyType, field: 'pct_threshold' | 'min_abs_dollars'): number {
  const line = rs.line_overrides?.[path]?.[field];
  if (line !== undefined) return line;
  const t = rs.type_overrides?.[type]?.[field];
  if (t !== undefined) return t;
  return field === 'pct_threshold' ? rs.pct_threshold : rs.min_abs_dollars;
}

function isDisabled(rs: RuleSet, path: string, type: AnomalyType): boolean {
  if (rs.line_overrides?.[path]?.disabled) return true;
  if (rs.type_overrides?.[type]?.disabled) return true;
  if (rs.enabled_types !== 'all' && !rs.enabled_types.includes(type)) return true;
  return false;
}

export function detect(priorReturn: TaxReturn, currentReturn: TaxReturn, ruleset?: Partial<RuleSet>): RawFinding[] {
  const rs: RuleSet = { ...DEFAULT_RULESET, ...ruleset };
  const P = flatten(priorReturn);
  const C = flatten(currentReturn);
  const out: RawFinding[] = [];

  const push = (f: RawFinding, type: AnomalyType = f.anomaly_type) => {
    if (!isDisabled(rs, f.canonical_path, type)) out.push(f);
  };

  // ---------- 1. Structural / header pass (runs first; others can reference it) ----------
  const ph = priorReturn.header;
  const ch = currentReturn.header;
  if (ph.filing_status !== ch.filing_status) {
    push({
      anomaly_type: 'filing_status_or_structural_change',
      subtype: 'filing_status',
      form: '1040',
      canonical_path: 'header.filing_status',
      label: 'Filing status',
      role: 'meta',
      prior_value: null,
      current_value: null,
      pct: null,
      abs_delta: null,
      reasons: [`Filing status changed: ${ph.filing_status} → ${ch.filing_status}`],
      flags: ['always_material'],
      is_context: true,
    });
  }
  if (ph.deduction_method !== ch.deduction_method) {
    push({
      anomaly_type: 'filing_status_or_structural_change',
      subtype: 'deduction_method',
      form: '1040',
      canonical_path: 'header.deduction_method',
      label: 'Deduction method',
      role: 'meta',
      prior_value: null,
      current_value: null,
      pct: null,
      abs_delta: null,
      reasons: [`Deduction method changed: ${ph.deduction_method} → ${ch.deduction_method}`],
      flags: [],
      is_context: true,
    });
  }
  // CTC qualifying-children off-by-one — routed to 1040.19 so it merges with the credit's variance.
  if (ph.num_qualifying_children_ctc !== ch.num_qualifying_children_ctc) {
    const priorCtc = P.values.get('1040.19') ?? null;
    const currCtc = C.values.get('1040.19') ?? null;
    const pct = priorCtc && currCtc !== null ? (currCtc - priorCtc) / Math.abs(priorCtc) : null;
    push(
      {
        anomaly_type: 'filing_status_or_structural_change',
        subtype: 'ctc_children',
        form: '1040',
        line: '19',
        canonical_path: '1040.19',
        label: labelFor('1040.19'),
        role: 'credit',
        prior_value: priorCtc,
        current_value: currCtc,
        pct,
        abs_delta: priorCtc !== null && currCtc !== null ? Math.abs(currCtc - priorCtc) : null,
        reasons: [
          `Only ${ch.num_qualifying_children_ctc} of ${ch.num_dependents} dependents are flagged as CTC-qualifying (was ${ph.num_qualifying_children_ctc}) — likely an off-by-one`,
        ],
        flags: [],
      },
      'filing_status_or_structural_change',
    );
  }

  // ---------- 2. Schedule presence pass ----------
  const missingForms = new Set<string>();
  const newForms = new Set<string>();
  const allForms = new Set([...Object.keys(priorReturn.forms), ...Object.keys(currentReturn.forms)]);
  for (const form of allForms) {
    if (form === '1040' || PRESENCE_EXEMPT_FORMS.has(form)) continue;
    const had = P.withData.has(form);
    const has = C.withData.has(form);
    if (had === has) continue;
    const primary = SCHEDULE_PRIMARY[form];
    const primaryPath = primary ? `${form}.${primary}` : undefined;
    const scheduleLabel = primaryPath && labelFor(primaryPath) !== primaryPath ? labelFor(primaryPath) : formLabel(form);
    const scheduleRole = primaryPath ? roleFor(primaryPath) : 'income';
    if (had && !has) {
      missingForms.add(form);
      const primaryVal = primaryPath ? (P.values.get(primaryPath) ?? null) : null;
      push({
        anomaly_type: 'missing_schedule',
        form,
        canonical_path: form,
        label: scheduleLabel,
        role: scheduleRole,
        prior_value: primaryVal,
        current_value: null,
        pct: null,
        abs_delta: primaryVal !== null ? Math.abs(primaryVal) : null,
        reasons: [`${formLabel(form)} was filed last year but is absent this year`],
        flags: ['always_material'],
      });
    } else {
      newForms.add(form);
      const primaryVal = primaryPath ? (C.values.get(primaryPath) ?? null) : null;
      push({
        anomaly_type: 'new_schedule',
        form,
        canonical_path: form,
        label: scheduleLabel,
        role: scheduleRole,
        prior_value: null,
        current_value: primaryVal,
        pct: null,
        abs_delta: primaryVal !== null ? Math.abs(primaryVal) : null,
        reasons: [`${formLabel(form)} is new this year (not on last year's return)`],
        flags: [],
      });
    }
  }

  // ---------- 3. Return-outcome sign flip ----------
  const priorNet = (P.values.get('1040.34') ?? 0) - (P.values.get('1040.37') ?? 0);
  const currNet = (C.values.get('1040.34') ?? 0) - (C.values.get('1040.37') ?? 0);
  if (priorNet !== 0 && currNet !== 0 && Math.sign(priorNet) !== Math.sign(currNet)) {
    const refundToOwe = priorNet > 0;
    const line = refundToOwe ? '37' : '34';
    push({
      anomaly_type: 'sign_flip',
      subtype: refundToOwe ? 'refund_to_owe' : 'owe_to_refund',
      form: '1040',
      line,
      canonical_path: `1040.${line}`,
      label: 'Return outcome (refund / amount owed)',
      role: 'result',
      prior_value: priorNet,
      current_value: currNet,
      pct: (currNet - priorNet) / Math.abs(priorNet),
      abs_delta: Math.abs(currNet - priorNet),
      reasons: [
        refundToOwe
          ? `Last year's refund of ${fmtMoney(priorNet)} has become ${fmtMoney(-currNet)} owed`
          : `Last year's ${fmtMoney(-priorNet)} owed has become a ${fmtMoney(currNet)} refund`,
      ],
      flags: ['return_outcome', 'always_material'],
    });
  }

  // ---------- 4. Line-by-line pass ----------
  const allPaths = new Set([...P.values.keys(), ...C.values.keys()]);
  for (const path of allPaths) {
    const [form, line] = splitPath(path);
    if (form === '1040' && (line === '34' || line === '37')) continue; // outcome handled above
    if (missingForms.has(form) || newForms.has(form)) continue; // rolled into schedule finding
    if (isNoEmit(path)) continue;
    if (mirrorOf(path)) continue; // suppress mirror; its target carries the signal

    const role = roleFor(path);
    const flags = flagsFor(path);
    const label = labelFor(path);
    const alwaysMaterial = flags.includes('always_material');
    const p = P.values.has(path) ? P.values.get(path)! : null;
    const c = C.values.has(path) ? C.values.get(path)! : null;

    const base = (over: Partial<RawFinding>): RawFinding => ({
      anomaly_type: 'pct_variance_over_threshold',
      form,
      line,
      canonical_path: path,
      label,
      role,
      prior_value: p,
      current_value: c,
      pct: null,
      abs_delta: null,
      reasons: [],
      flags,
      ...over,
    });

    const droppedOrVanished = (priorVal: number, curVal: number | null) => {
      const absDelta = Math.abs(priorVal);
      if (role === 'income') {
        if (absDelta < INCOME_VANISH_FLOOR) return;
        push(
          base({
            anomaly_type: 'vanished_income_source',
            current_value: curVal,
            pct: -1,
            abs_delta: absDelta,
            reasons: [`${label} of ${fmtMoney(priorVal)} is gone this year`],
          }),
          'vanished_income_source',
        );
        return;
      }
      if (role === 'deduction' || role === 'credit') {
        if (flags.includes('carryover') || flags.includes('depreciation')) {
          push(
            base({
              anomaly_type: 'dropped_carryover_or_depreciation',
              current_value: curVal,
              pct: -1,
              abs_delta: absDelta,
              reasons: [`${label} of ${fmtMoney(priorVal)} was claimed last year but is gone — easy to silently lose`],
            }),
            'dropped_carryover_or_depreciation',
          );
          return;
        }
        push(
          base({
            anomaly_type: 'dropped_deduction',
            current_value: curVal,
            pct: -1,
            abs_delta: absDelta,
            reasons: [`${label} of ${fmtMoney(priorVal)} last year is now $0`],
          }),
          'dropped_deduction',
        );
        return;
      }
      push(
        base({
          anomaly_type: 'missing_line',
          current_value: curVal,
          pct: -1,
          abs_delta: absDelta,
          reasons: [`${label} dropped from ${fmtMoney(priorVal)} to ${fmtMoney(curVal)}`],
        }),
        'missing_line',
      );
    };

    const newFromZero = (curVal: number) => {
      push(
        base({
          anomaly_type: 'new_from_zero',
          pct: null,
          abs_delta: Math.abs(curVal),
          reasons: [`${label} is new this year at ${fmtMoney(curVal)} (was $0 last year)`],
        }),
        'new_from_zero',
      );
    };

    if (p !== null && c !== null) {
      if (p !== 0 && c !== 0) {
        const pct = (c - p) / Math.abs(p);
        const absDelta = Math.abs(c - p);
        if (flags.includes('sign_outcome') && Math.sign(p) !== Math.sign(c)) {
          push(
            base({
              anomaly_type: 'sign_flip',
              subtype: p > 0 ? 'profit_to_loss' : 'loss_to_profit',
              pct,
              abs_delta: absDelta,
              reasons: [`${label} flipped from ${fmtMoney(p)} to ${fmtMoney(c)}`],
            }),
            'sign_flip',
          );
          continue;
        }
        const thr = resolve(rs, path, 'pct_variance_over_threshold', 'pct_threshold');
        const minA = resolve(rs, path, 'pct_variance_over_threshold', 'min_abs_dollars');
        const pctFires = Math.abs(pct) >= thr && (alwaysMaterial || absDelta >= minA);
        const absFires = absDelta >= ABS_JUMP_FLOORS[role];
        if (pctFires || absFires) {
          const reasons: string[] = [];
          if (pctFires) reasons.push(`${fmtPct(pct)} vs last year (${fmtMoney(p)} → ${fmtMoney(c)})`);
          if (absFires && !pctFires) reasons.push(`${fmtMoney(absDelta)} swing (${fmtMoney(p)} → ${fmtMoney(c)})`);
          push(
            base({
              anomaly_type: pctFires ? 'pct_variance_over_threshold' : 'absolute_dollar_jump',
              pct,
              abs_delta: absDelta,
              reasons,
            }),
            pctFires ? 'pct_variance_over_threshold' : 'absolute_dollar_jump',
          );
        } else if (INFO_ROLES.includes(role) && Math.abs(pct) >= thr * INFO_PCT_FRACTION && absDelta >= INFO_MIN_ABS) {
          push(
            base({
              anomaly_type: 'informational_change',
              pct,
              abs_delta: absDelta,
              reasons: [`${fmtPct(pct)} (${fmtMoney(p)} → ${fmtMoney(c)}) — below your ${Math.round(thr * 100)}% threshold`],
            }),
            'informational_change',
          );
        }
      } else if (p !== 0 && c === 0) {
        droppedOrVanished(p, 0);
      } else if (p === 0 && c !== 0) {
        newFromZero(c);
      }
    } else if (p !== null && c === null) {
      if (p !== 0) droppedOrVanished(p, null);
    } else if (p === null && c !== null) {
      if (c !== 0) newFromZero(c);
    }
  }

  // ---------- 5. Ratio / consistency pass ----------
  // Itemized total now below the standard deduction → should switch methods.
  if (ch.deduction_method === 'itemized') {
    const std = standardDeduction(currentReturn.tax_year, ch.filing_status);
    const l12 = C.values.get('1040.12') ?? null;
    const priorL12 = P.values.get('1040.12') ?? null;
    if (std && l12 !== null && l12 < std) {
      push(
        {
          anomaly_type: 'ratio_proportion_anomaly',
          subtype: 'itemized_below_standard',
          form: '1040',
          line: '12',
          canonical_path: '1040.12',
          label: labelFor('1040.12'),
          role: 'deduction',
          prior_value: priorL12,
          current_value: l12,
          pct: priorL12 ? (l12 - priorL12) / Math.abs(priorL12) : null,
          abs_delta: std - l12,
          reasons: [
            `Itemized ${fmtMoney(l12)} is now below the ${fmtMoney(std)} standard deduction — switching adds ${fmtMoney(std - l12)} of deductions`,
          ],
          flags: [],
        },
        'ratio_proportion_anomaly',
      );
    }
  }

  // Schedule C present without Schedule SE (or vice-versa) in the current year.
  const hasC = C.withData.has('ScheduleC');
  const hasSE = C.withData.has('ScheduleSE');
  if (hasC !== hasSE) {
    push(
      {
        anomaly_type: 'ratio_proportion_anomaly',
        subtype: 'sch_c_se_mismatch',
        form: hasC ? 'ScheduleC' : 'ScheduleSE',
        canonical_path: hasC ? 'ScheduleC' : 'ScheduleSE',
        label: 'Schedule C / SE consistency',
        role: 'tax',
        prior_value: null,
        current_value: null,
        pct: null,
        abs_delta: null,
        reasons: [
          hasC
            ? 'Schedule C has business income but Schedule SE is missing — self-employment tax may be understated'
            : 'Schedule SE is present but Schedule C is missing — unexpected',
        ],
        flags: ['always_material'],
      },
      'ratio_proportion_anomaly',
    );
  }

  // Registry ratios (skip when a numerator went to/from zero — that's a drop/new, handled above).
  for (const def of RATIO_DEFS) {
    const np = P.values.get(def.numerator);
    const dp = P.values.get(def.denominator);
    const nc = C.values.get(def.numerator);
    const dc = C.values.get(def.denominator);
    if (np == null || dp == null || nc == null || dc == null) continue;
    if (np === 0 || nc === 0 || Math.abs(dp) < 1000 || Math.abs(dc) < 1000) continue;
    const rp = np / dp;
    const rc = nc / dc;
    const shift = (rc - rp) / Math.abs(rp);
    const crossesHard = def.hardMax !== undefined && rc > def.hardMax;
    if (Math.abs(shift) >= (def.threshold ?? 0.3) || crossesHard) {
      push(
        {
          anomaly_type: 'ratio_proportion_anomaly',
          subtype: def.key,
          form: '1040',
          canonical_path: def.numerator,
          label: def.label,
          role: roleFor(def.numerator),
          prior_value: np,
          current_value: nc,
          pct: shift,
          abs_delta: Math.abs(nc - np),
          reasons: [`${def.label} shifted ${fmtPct(shift)} (${(rp * 100).toFixed(1)}% → ${(rc * 100).toFixed(1)}%)`],
          flags: [],
        },
        'ratio_proportion_anomaly',
      );
    }
  }

  return out;
}
