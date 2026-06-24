/**
 * Static line registry + year-specific tax constants.
 *
 * Input return data carries ONLY values. Everything semantic — labels, roles, behavioural
 * flags — lives here, so the detection engine is data-driven and the seed data stays clean.
 */
import type { FilingStatus, LineRole, RegistryEntry } from '../../shared/types.js';

/** Behavioural flags that change how a line is scored / detected. */
export type LineFlag =
  | 'always_material' // bypasses min_abs suppression
  | 'carryover' // capital-loss carryover — silently dropped is dangerous
  | 'depreciation' // "allowed or allowable" — silently dropped is dangerous
  | 'sign_outcome' // profit/loss or gain/loss line — eligible for sign_flip
  | 'return_outcome' // the refund / amount-owed result lines
  | 'no_emit'; // pure computed total — used for ratios/sign but never flagged directly

interface RawEntry {
  path: string; // "form.line"
  label: string;
  role: LineRole;
  flags?: LineFlag[];
  /** This line duplicates the economic value of another (suppress its findings, keep the target). */
  mirror_of?: string;
}

const RAW: RawEntry[] = [
  // ---- Form 1040 ----
  { path: '1040.1a', label: 'Wages (W-2 box 1)', role: 'income' },
  { path: '1040.2b', label: 'Taxable interest', role: 'income' },
  { path: '1040.3b', label: 'Ordinary dividends', role: 'income' },
  { path: '1040.7', label: 'Capital gain / (loss)', role: 'income', flags: ['sign_outcome'] },
  { path: '1040.8', label: 'Additional income (Schedule 1)', role: 'income' },
  { path: '1040.9', label: 'Total income', role: 'total', flags: ['no_emit'] },
  { path: '1040.11', label: 'Adjusted gross income', role: 'total', flags: ['no_emit'] },
  { path: '1040.12', label: 'Standard/Itemized deduction', role: 'deduction' },
  { path: '1040.15', label: 'Taxable income', role: 'total', flags: ['no_emit'] },
  { path: '1040.16', label: 'Tax', role: 'tax' },
  { path: '1040.19', label: 'Child tax credit / ODC', role: 'credit' },
  { path: '1040.22', label: 'Tax after credits', role: 'tax', flags: ['no_emit'] },
  { path: '1040.23', label: 'Other taxes incl. SE tax (Schedule 2)', role: 'tax' },
  { path: '1040.24', label: 'Total tax', role: 'tax', flags: ['no_emit'] },
  { path: '1040.25', label: 'Federal income tax withheld', role: 'payment' },
  { path: '1040.26', label: 'Estimated tax payments', role: 'payment' },
  { path: '1040.33', label: 'Total payments', role: 'payment', flags: ['no_emit'] },
  { path: '1040.34', label: 'Overpayment / refund', role: 'result', flags: ['return_outcome', 'always_material'] },
  { path: '1040.37', label: 'Amount you owe', role: 'result', flags: ['return_outcome', 'always_material'] },

  // ---- Schedule 1 (additional income & adjustments) ----
  { path: 'Schedule1.3', label: 'Business income (Schedule C)', role: 'income', mirror_of: '1040.8' },
  { path: 'Schedule1.5', label: 'Rental/royalty/S-corp (Schedule E)', role: 'income', flags: ['sign_outcome'] },
  { path: 'Schedule1.15', label: 'Deductible part of SE tax', role: 'deduction' },

  // ---- Schedule A (itemized deductions) ----
  { path: 'ScheduleA.5e', label: 'State & local taxes (SALT, capped)', role: 'deduction' },
  { path: 'ScheduleA.8e', label: 'Home mortgage interest', role: 'deduction' },
  { path: 'ScheduleA.11', label: 'Gifts to charity', role: 'deduction' },
  { path: 'ScheduleA.17', label: 'Total itemized deductions', role: 'subtotal', mirror_of: '1040.12' },

  // ---- Schedule B (interest & dividends) ----
  { path: 'ScheduleB.2', label: 'Total taxable interest', role: 'income', mirror_of: '1040.2b' },
  { path: 'ScheduleB.6', label: 'Total ordinary dividends', role: 'income', mirror_of: '1040.3b' },

  // ---- Schedule C (business profit/loss) ----
  { path: 'ScheduleC.1', label: 'Gross receipts', role: 'income' },
  { path: 'ScheduleC.28', label: 'Total expenses', role: 'deduction' },
  { path: 'ScheduleC.31', label: 'Net business profit / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Schedule D (capital gains & losses) ----
  { path: 'ScheduleD.6', label: 'Short-term loss carryover', role: 'deduction', flags: ['carryover', 'always_material'] },
  { path: 'ScheduleD.14', label: 'Long-term loss carryover', role: 'deduction', flags: ['carryover', 'always_material'] },
  { path: 'ScheduleD.16', label: 'Net capital gain / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Schedule E (rental / royalty / pass-through) ----
  { path: 'ScheduleE.18', label: 'Depreciation expense', role: 'deduction', flags: ['depreciation', 'always_material'] },
  { path: 'ScheduleE.26', label: 'Total rental/pass-through income / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Schedule SE (self-employment tax) ----
  { path: 'ScheduleSE.12', label: 'Self-employment tax', role: 'tax' },
  { path: 'ScheduleSE.13', label: 'Deduction for half of SE tax', role: 'deduction', mirror_of: 'Schedule1.15' },

  // ---- Schedule 8812 (Child Tax Credit) ----
  { path: 'Schedule8812.14', label: 'Child tax credit', role: 'credit', mirror_of: '1040.19' },
];

export const LINE_REGISTRY: RegistryEntry[] = RAW.map((r) => {
  const [form, line] = splitPath(r.path);
  return { canonical_path: r.path, form, line, label: r.label, role: r.role, flags: r.flags };
});

const REGISTRY_MAP = new Map<string, RegistryEntry>(LINE_REGISTRY.map((e) => [e.canonical_path, e]));

/** path -> the summary line it duplicates. Findings on the mirror are suppressed in favour of the target. */
export const LINE_MIRRORS: Record<string, string> = Object.fromEntries(
  RAW.filter((r) => r.mirror_of).map((r) => [r.path, r.mirror_of as string]),
);

/**
 * Schedules feed values onto 1040/Schedule-1 summary lines. When a schedule goes MISSING,
 * findings on the lines it fed are rolled into the missing-schedule finding (as context),
 * not reported separately — so "Schedule C gone" and "$18,500 income vanished" become one card.
 */
export const SCHEDULE_FEEDS: Record<string, string[]> = {
  ScheduleC: ['1040.8'],
  ScheduleE: ['Schedule1.5'],
  ScheduleSE: ['1040.23', 'Schedule1.15'],
};

/** A dependent schedule's missing-finding merges into its parent's (no Sch C ⇒ no Sch SE). */
export const SCHEDULE_DEPENDS_ON: Record<string, string> = {
  ScheduleSE: 'ScheduleC',
};

/**
 * Forms that never trigger a missing/new SCHEDULE finding. Schedule 1 is a pure aggregator —
 * its lines mirror/feed 1040 lines, so its appearance/disappearance is always a consequence of
 * an underlying income/adjustment change we already catch on the 1040.
 */
export const PRESENCE_EXEMPT_FORMS = new Set<string>(['Schedule1']);

export function mirrorOf(path: string): string | undefined {
  return LINE_MIRRORS[path];
}

export function isNoEmit(path: string): boolean {
  return hasFlag(path, 'no_emit');
}

export function splitPath(path: string): [string, string] {
  const idx = path.indexOf('.');
  return [path.slice(0, idx), path.slice(idx + 1)];
}

export function canonicalPath(form: string, line: string): string {
  return `${form}.${line}`;
}

export function getRegistryEntry(path: string): RegistryEntry | undefined {
  return REGISTRY_MAP.get(path);
}

export function labelFor(path: string): string {
  return REGISTRY_MAP.get(path)?.label ?? path;
}

export function roleFor(path: string): LineRole {
  return REGISTRY_MAP.get(path)?.role ?? 'meta';
}

export function flagsFor(path: string): LineFlag[] {
  return (REGISTRY_MAP.get(path)?.flags as LineFlag[] | undefined) ?? [];
}

export function hasFlag(path: string, flag: LineFlag): boolean {
  return flagsFor(path).includes(flag);
}

/** Everything that isn't the master 1040 form is a "schedule" for missing/new detection. */
export function isSchedule(form: string): boolean {
  return form !== '1040';
}

// ---- Return-outcome & sign-outcome anchors used by the engine ----
export const OUTCOME_REFUND = '1040.34';
export const OUTCOME_OWED = '1040.37';
/** Lines whose sign (profit/loss, gain/loss) is meaningful. */
export const SIGN_OUTCOME_PATHS = LINE_REGISTRY.filter((e) => (e.flags ?? []).includes('sign_outcome')).map(
  (e) => e.canonical_path,
);

// ---- Form display metadata (drives the frontend tab strip) ----
export const FORM_META: Record<string, { label: string; short: string; order: number }> = {
  '1040': { label: 'Form 1040', short: '1040', order: 0 },
  Schedule1: { label: 'Schedule 1', short: 'Sch 1', order: 1 },
  ScheduleA: { label: 'Schedule A — Itemized', short: 'Sch A', order: 2 },
  ScheduleB: { label: 'Schedule B — Interest & Dividends', short: 'Sch B', order: 3 },
  ScheduleC: { label: 'Schedule C — Business', short: 'Sch C', order: 4 },
  ScheduleD: { label: 'Schedule D — Capital Gains', short: 'Sch D', order: 5 },
  ScheduleE: { label: 'Schedule E — Rental/Pass-through', short: 'Sch E', order: 6 },
  ScheduleSE: { label: 'Schedule SE — Self-Employment Tax', short: 'Sch SE', order: 7 },
  Schedule8812: { label: 'Schedule 8812 — Child Tax Credit', short: 'Sch 8812', order: 8 },
};

export function formLabel(form: string): string {
  return FORM_META[form]?.label ?? form;
}

// ===================== Year-specific tax constants =====================

export interface TaxConstants {
  standard_deduction: Record<FilingStatus, number>;
  salt_cap: number;
  salt_cap_mfs: number;
  /** EITC is disallowed if investment income exceeds this (inflation-indexed). */
  eitc_investment_limit: number;
  ctc_per_child: number;
  ctc_phaseout_single: number;
  ctc_phaseout_mfj: number;
}

export const TAX_CONSTANTS: Record<number, TaxConstants> = {
  2023: {
    standard_deduction: { single: 13850, MFJ: 27700, MFS: 13850, HOH: 20800, QW: 27700 },
    salt_cap: 10000,
    salt_cap_mfs: 5000,
    eitc_investment_limit: 11000,
    ctc_per_child: 2000,
    ctc_phaseout_single: 200000,
    ctc_phaseout_mfj: 400000,
  },
  2024: {
    standard_deduction: { single: 14600, MFJ: 29200, MFS: 14600, HOH: 21900, QW: 29200 },
    salt_cap: 10000,
    salt_cap_mfs: 5000,
    eitc_investment_limit: 11600,
    ctc_per_child: 2000,
    ctc_phaseout_single: 200000,
    ctc_phaseout_mfj: 400000,
  },
};

export function standardDeduction(year: number, status: FilingStatus): number | undefined {
  return TAX_CONSTANTS[year]?.standard_deduction[status];
}

/** Ratio / consistency definitions consumed by the ratio_proportion_anomaly detector. */
export interface RatioDef {
  key: string;
  label: string;
  numerator: string;
  denominator: string;
  /** relative-shift threshold to flag (default 0.30). */
  threshold?: number;
  /** optional hard upper bound that, if crossed, always flags. */
  hardMax?: number;
}

export const RATIO_DEFS: RatioDef[] = [
  { key: 'deduction_to_agi', label: 'Deductions ÷ AGI', numerator: '1040.12', denominator: '1040.11', hardMax: 0.9 },
  { key: 'effective_rate', label: 'Effective tax rate', numerator: '1040.24', denominator: '1040.15' },
  { key: 'withholding_to_income', label: 'Withholding ÷ total income', numerator: '1040.25', denominator: '1040.9' },
  { key: 'charity_to_agi', label: 'Charitable gifts ÷ AGI', numerator: 'ScheduleA.11', denominator: '1040.11' },
];
