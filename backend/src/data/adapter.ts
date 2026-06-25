/**
 * Adapter: official hackathon sample-data schema → our internal TaxReturn model.
 *
 * Official files are flat: { client, demographics, tax_year, forms_present, line_items, _meta }.
 * We group line_items under their form, mark form presence from forms_present (+ data), and fill
 * the header so the existing detection engine runs unchanged.
 */
import type { FilingStatus, FormData, TaxReturn } from '../../../shared/types.js';
import { formForKey, normalizeForm } from '../registry.js';

export interface OfficialReturn {
  client: { name: string; client_id: string; filing_status: string; preparer?: string };
  demographics?: { dependents?: number; state?: string; taxpayer_occupation?: string; [k: string]: unknown };
  tax_year: number;
  form?: string;
  forms_present: string[];
  line_items: Record<string, number>;
  _meta?: { planted_anomalies?: string[]; role?: string; [k: string]: unknown };
}

function mapFilingStatus(s: string): FilingStatus {
  const t = (s || '').toLowerCase();
  if (t.includes('joint')) return 'MFJ';
  if (t.includes('separate')) return 'MFS';
  if (t.includes('head')) return 'HOH';
  if (t.includes('widow') || t.includes('surviving')) return 'QW';
  return 'single';
}

/** "Johnson, Robert & Maria" -> "johnson". */
export function slugForClient(o: OfficialReturn): string {
  const surname = (o.client.name.split(',')[0] || o.client.name).trim().split(/\s+/)[0];
  return surname.toLowerCase();
}

export function adaptOfficialReturn(o: OfficialReturn): TaxReturn {
  const formsPresent = new Set((o.forms_present || []).map(normalizeForm));
  const forms: Record<string, FormData> = {};
  const ensure = (form: string): FormData => (forms[form] ??= { present: false, lines: {} });

  for (const f of formsPresent) ensure(f);
  for (const [key, value] of Object.entries(o.line_items || {})) {
    ensure(formForKey(key)).lines[key] = { value: typeof value === 'number' ? value : null };
  }

  for (const [formId, fd] of Object.entries(forms)) {
    const hasData = Object.values(fd.lines).some((l) => l.value !== null && l.value !== 0);
    fd.present = formsPresent.has(formId) || hasData;
  }
  ensure('1040').present = true;

  const deps = o.demographics?.dependents ?? 0;
  return {
    taxpayer_id: slugForClient(o),
    display_name: o.client.name,
    tax_year: o.tax_year,
    header: {
      filing_status: mapFilingStatus(o.client.filing_status),
      num_dependents: deps,
      // Not in the source — held constant per client so it never produces a spurious structural flag.
      num_qualifying_children_ctc: deps,
      deduction_method: formsPresent.has('ScheduleA') ? 'itemized' : 'standard',
    },
    forms,
  };
}
