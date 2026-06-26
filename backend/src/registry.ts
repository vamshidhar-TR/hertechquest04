/**
 * Static line registry + year-specific tax constants — keyed to the OFFICIAL hackathon
 * sample-data schema (flat `line_items` keys like `charitable_cash_sch_a`, `wages_1040_1a`).
 *
 * Input data carries only values + a `forms_present` list. Everything semantic — which form a
 * line belongs to, its label, its role, behavioural flags — lives here, so the detection engine
 * stays data-driven. canonical_path is `<form>.<key>` (form derived from the key's suffix).
 */
import type { FilingStatus, LineRole, RegistryEntry } from '../../shared/types.js';

export type LineFlag =
  | 'always_material'
  | 'carryover' // capital-loss carryover — silently dropped is dangerous
  | 'depreciation' // "allowed or allowable" — silently dropped is dangerous
  | 'sign_outcome' // profit/loss, gain/loss, or refund/owe — eligible for sign_flip
  | 'no_emit'; // pure computed total — used for context but never flagged directly

interface RawLine {
  key: string; // the official line_items key
  form: string; // normalized form id
  label: string;
  role: LineRole;
  flags?: LineFlag[];
}

/** Normalize an official forms_present entry ("Schedule A", "Form 8283") to a form id. */
export function normalizeForm(name: string): string {
  return name.replace(/\s+/g, '');
}

/** Fallback: derive a form id from a line_items key's suffix (for any key not in the table). */
export function formFromKey(key: string): string {
  if (key.endsWith('_sch_se')) return 'ScheduleSE';
  if (key.endsWith('_sch_c')) return 'ScheduleC';
  if (key.endsWith('_sch_e')) return 'ScheduleE';
  if (key.endsWith('_sch_a')) return 'ScheduleA';
  if (key.endsWith('_sch_b')) return 'ScheduleB';
  if (key.endsWith('_sch_d')) return 'ScheduleD';
  if (key.endsWith('_sch1')) return 'Schedule1';
  if (key.endsWith('_8283')) return 'Form8283';
  if (key.endsWith('_8829')) return 'Form8829';
  return '1040';
}

const RAW: RawLine[] = [
  // ---- Form 1040 ----
  { key: 'wages_1040_1a', form: '1040', label: 'Wages (W-2 box 1)', role: 'income' },
  { key: 'total_income_wages_only', form: '1040', label: 'Total income (wages only)', role: 'total', flags: ['no_emit'] },
  { key: 'tax_exempt_interest_1040_2a', form: '1040', label: 'Tax-exempt interest', role: 'income' },
  { key: 'taxable_interest_1040_2b', form: '1040', label: 'Taxable interest', role: 'income' },
  { key: 'qualified_dividends_1040_3a', form: '1040', label: 'Qualified dividends', role: 'income' },
  { key: 'ordinary_dividends_1040_3b', form: '1040', label: 'Ordinary dividends', role: 'income' },
  { key: 'ira_distributions_1040_4b', form: '1040', label: 'IRA distributions (taxable)', role: 'income' },
  { key: 'pension_annuity_1040_5b', form: '1040', label: 'Pensions & annuities (taxable)', role: 'income' },
  { key: 'social_security_taxable_1040_6b', form: '1040', label: 'Social Security (taxable)', role: 'income' },
  { key: 'total_income', form: '1040', label: 'Total income', role: 'total', flags: ['no_emit'] },
  { key: 'adjusted_gross_income', form: '1040', label: 'Adjusted gross income', role: 'total', flags: ['no_emit'] },
  { key: 'standard_deduction', form: '1040', label: 'Standard deduction', role: 'deduction' },
  { key: 'qbi_deduction_1040_13', form: '1040', label: 'Qualified business income deduction', role: 'deduction' },
  { key: 'taxable_income', form: '1040', label: 'Taxable income', role: 'total', flags: ['no_emit'] },
  { key: 'income_tax_1040_16', form: '1040', label: 'Income tax', role: 'tax' },
  { key: 'child_tax_credit', form: '1040', label: 'Child tax credit', role: 'credit' },
  { key: 'education_credits', form: '1040', label: 'Education credits', role: 'credit' },
  { key: 'total_credits', form: '1040', label: 'Total credits', role: 'credit', flags: ['no_emit'] },
  { key: 'other_taxes_1040_23', form: '1040', label: 'Other taxes', role: 'tax' },
  { key: 'total_tax', form: '1040', label: 'Total tax', role: 'tax', flags: ['no_emit'] },
  { key: 'federal_withholding', form: '1040', label: 'Federal income tax withheld', role: 'payment' },
  { key: 'estimated_payments', form: '1040', label: 'Estimated tax payments', role: 'payment' },
  { key: 'total_payments', form: '1040', label: 'Total payments', role: 'payment', flags: ['no_emit'] },
  { key: 'refund_or_due', form: '1040', label: 'Refund / amount due', role: 'result', flags: ['sign_outcome', 'always_material'] },

  // ---- Schedule 1 (adjustments) ----
  { key: 'ira_deduction_sch1', form: 'Schedule1', label: 'IRA deduction', role: 'deduction' },
  { key: 'hsa_deduction_sch1', form: 'Schedule1', label: 'HSA deduction', role: 'deduction' },
  { key: 'student_loan_interest_sch1', form: 'Schedule1', label: 'Student loan interest', role: 'deduction' },
  { key: 'se_tax_deduction_sch1', form: 'Schedule1', label: 'Deductible part of SE tax', role: 'deduction' },
  { key: 'total_adjustments_sch1', form: 'Schedule1', label: 'Total adjustments', role: 'total', flags: ['no_emit'] },

  // ---- Schedule A (itemized) ----
  { key: 'medical_expenses_sch_a', form: 'ScheduleA', label: 'Medical expenses', role: 'deduction' },
  { key: 'state_local_taxes_sch_a', form: 'ScheduleA', label: 'State & local taxes (SALT)', role: 'deduction' },
  { key: 'mortgage_interest_sch_a', form: 'ScheduleA', label: 'Home mortgage interest', role: 'deduction' },
  { key: 'charitable_cash_sch_a', form: 'ScheduleA', label: 'Charitable contributions (cash)', role: 'deduction' },
  { key: 'total_itemized_deductions_sch_a', form: 'ScheduleA', label: 'Total itemized deductions', role: 'subtotal' },

  // ---- Form 8283 (noncash charitable) ----
  { key: 'charitable_noncash_8283', form: 'Form8283', label: 'Charitable contributions (noncash)', role: 'deduction' },

  // ---- Schedule B (interest & dividends) ----
  { key: 'taxable_interest_sch_b', form: 'ScheduleB', label: 'Taxable interest', role: 'income' },
  { key: 'ordinary_dividends_sch_b', form: 'ScheduleB', label: 'Ordinary dividends', role: 'income' },

  // ---- Schedule C (business) ----
  { key: 'gross_receipts_sch_c', form: 'ScheduleC', label: 'Gross receipts', role: 'income' },
  { key: 'returns_allowances_sch_c', form: 'ScheduleC', label: 'Returns & allowances', role: 'income' },
  { key: 'cost_of_goods_sold_sch_c', form: 'ScheduleC', label: 'Cost of goods sold', role: 'deduction' },
  { key: 'gross_profit_sch_c', form: 'ScheduleC', label: 'Gross profit', role: 'subtotal' },
  { key: 'advertising_sch_c', form: 'ScheduleC', label: 'Advertising', role: 'deduction' },
  { key: 'car_and_truck_sch_c', form: 'ScheduleC', label: 'Car & truck expenses', role: 'deduction' },
  { key: 'contract_labor_sch_c', form: 'ScheduleC', label: 'Contract labor', role: 'deduction' },
  { key: 'supplies_sch_c', form: 'ScheduleC', label: 'Supplies', role: 'deduction' },
  { key: 'total_expenses_sch_c', form: 'ScheduleC', label: 'Total expenses', role: 'subtotal' },
  { key: 'net_profit_sch_c', form: 'ScheduleC', label: 'Net business profit / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Form 8829 (home office) ----
  { key: 'home_office_8829', form: 'Form8829', label: 'Home office deduction', role: 'deduction' },

  // ---- Schedule D (capital gains) ----
  { key: 'capital_gains_sch_d', form: 'ScheduleD', label: 'Capital gain / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Schedule E (rental / pass-through) ----
  { key: 'rents_received_prop_a_sch_e', form: 'ScheduleE', label: 'Rents received — property A', role: 'income' },
  { key: 'rents_received_prop_b_sch_e', form: 'ScheduleE', label: 'Rents received — property B', role: 'income' },
  { key: 'total_rents_received_sch_e', form: 'ScheduleE', label: 'Total rents received', role: 'subtotal' },
  { key: 'rental_mortgage_interest_sch_e', form: 'ScheduleE', label: 'Rental mortgage interest', role: 'deduction' },
  { key: 'rental_repairs_sch_e', form: 'ScheduleE', label: 'Rental repairs', role: 'deduction' },
  { key: 'rental_depreciation_sch_e', form: 'ScheduleE', label: 'Rental depreciation', role: 'deduction', flags: ['depreciation'] },
  { key: 'total_rental_expenses_sch_e', form: 'ScheduleE', label: 'Total rental expenses', role: 'subtotal' },
  { key: 'net_rental_income_sch_e', form: 'ScheduleE', label: 'Net rental income / (loss)', role: 'income', flags: ['sign_outcome'] },

  // ---- Schedule SE (self-employment tax) ----
  { key: 'self_employment_tax_sch_se', form: 'ScheduleSE', label: 'Self-employment tax', role: 'tax' },
  { key: 'self_employment_tax_other', form: 'ScheduleSE', label: 'Self-employment tax (other)', role: 'tax' },
];

const BY_KEY = new Map<string, RawLine>(RAW.map((r) => [r.key, r]));

/** The form a known line key belongs to (registry first, then suffix heuristic). */
export function formForKey(key: string): string {
  return BY_KEY.get(key)?.form ?? formFromKey(key);
}

/** Canonical path for an official line key: "<form>.<key>". */
export function pathForKey(key: string): string {
  return `${formForKey(key)}.${key}`;
}

export const LINE_REGISTRY: RegistryEntry[] = RAW.map((r) => ({
  canonical_path: `${r.form}.${r.key}`,
  form: r.form,
  line: r.key,
  label: r.label,
  role: r.role,
  flags: r.flags,
}));

const REGISTRY_MAP = new Map<string, RegistryEntry>(LINE_REGISTRY.map((e) => [e.canonical_path, e]));

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
  const e = REGISTRY_MAP.get(path);
  if (e) return e.label;
  const [, line] = splitPath(path);
  return line || path;
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

export function isSchedule(form: string): boolean {
  return form !== '1040';
}

export function isNoEmit(path: string): boolean {
  return hasFlag(path, 'no_emit');
}

// Relationships are intentionally empty for the official schema (the reference comparison is a
// straight line-by-line + missing-form diff; our scoring/tiers/AI/voice layer on top of it).
export const LINE_MIRRORS: Record<string, string> = {};
export function mirrorOf(path: string): string | undefined {
  return LINE_MIRRORS[path];
}
export const SCHEDULE_FEEDS: Record<string, string[]> = {};
export const SCHEDULE_DEPENDS_ON: Record<string, string> = {};
/** Schedule 1 is a curated aggregator that the official forms_present list omits — never flag it as a missing schedule. */
export const PRESENCE_EXEMPT_FORMS = new Set<string>(['Schedule1']);

/** Representative line per schedule, used to size a missing/new-schedule finding. */
export const SCHEDULE_PRIMARY: Record<string, string> = {
  ScheduleA: 'total_itemized_deductions_sch_a',
  ScheduleB: 'ordinary_dividends_sch_b',
  ScheduleC: 'net_profit_sch_c',
  ScheduleD: 'capital_gains_sch_d',
  ScheduleE: 'net_rental_income_sch_e',
  ScheduleSE: 'self_employment_tax_sch_se',
  Form8283: 'charitable_noncash_8283',
  Form8829: 'home_office_8829',
};

// ---- Form display metadata (drives the frontend tab strip) ----
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

export function formLabel(form: string): string {
  return FORM_META[form]?.label ?? form;
}

// ===================== Year-specific tax constants =====================

export interface TaxConstants {
  standard_deduction: Record<FilingStatus, number>;
  salt_cap: number;
  salt_cap_mfs: number;
  eitc_investment_limit: number;
  ctc_per_child: number;
  ctc_phaseout_single: number;
  ctc_phaseout_mfj: number;
}

export const TAX_CONSTANTS: Record<number, TaxConstants> = {
  2023: {
    standard_deduction: { single: 13850, MFJ: 27700, MFS: 13850, HOH: 20800, QW: 27700 },
    salt_cap: 10000, salt_cap_mfs: 5000, eitc_investment_limit: 11000,
    ctc_per_child: 2000, ctc_phaseout_single: 200000, ctc_phaseout_mfj: 400000,
  },
  2024: {
    standard_deduction: { single: 14600, MFJ: 29200, MFS: 14600, HOH: 21900, QW: 29200 },
    salt_cap: 10000, salt_cap_mfs: 5000, eitc_investment_limit: 11600,
    ctc_per_child: 2000, ctc_phaseout_single: 200000, ctc_phaseout_mfj: 400000,
  },
  2025: {
    standard_deduction: { single: 15000, MFJ: 30000, MFS: 15000, HOH: 22500, QW: 30000 },
    salt_cap: 10000, salt_cap_mfs: 5000, eitc_investment_limit: 11950,
    ctc_per_child: 2000, ctc_phaseout_single: 200000, ctc_phaseout_mfj: 400000,
  },
};

export function standardDeduction(year: number, status: FilingStatus): number | undefined {
  return TAX_CONSTANTS[year]?.standard_deduction[status];
}

export interface RatioDef {
  key: string;
  label: string;
  numerator: string;
  denominator: string;
  threshold?: number;
  hardMax?: number;
}

// Ratios are off by default for the official data so the Garcia control stays clean; the engine's
// explicit detectors (variance, missing/new form, within-form drop, sign flip) cover the planted set.
export const RATIO_DEFS: RatioDef[] = [];
