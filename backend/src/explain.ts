/**
 * "Why this matters" explanations for findings.
 *
 * With an API key: Claude (Opus) writes grounded plain-English rationale in one batched call.
 * Without one: tax-aware templates per anomaly type produce genuinely useful copy offline.
 * Detection/ranking is never in this path — explanations are layered on after the deterministic scan.
 */
import type { ExplainResponse, Finding } from '../../shared/types.js';
import { MODELS, claudeAvailable } from './config.js';
import { firstToolInput, getClient } from './claude.js';
import { fmtMoney, fmtPct } from './engine/util.js';

interface ExplanationParts {
  why_short: string;
  why_full: string;
  suggested_action: string;
}

export function templateExplain(f: Finding): ExplanationParts {
  const prior = fmtMoney(f.prior_value);
  const cur = fmtMoney(f.current_value);
  const label = f.label;

  switch (f.anomaly_type) {
    case 'missing_schedule':
      return {
        why_short: `${label} was on last year's return (${prior}) but is absent now — confirm it wasn't simply left out of the work-in-progress.`,
        why_full: `Last year this schedule carried ${prior}. When a return is started from a prior-year proforma, an entire schedule can quietly fail to carry over. If the underlying activity still exists, both income and any related tax (e.g. self-employment tax) are understated.`,
        suggested_action: 'Re-import the schedule, or confirm the activity ended this year.',
      };
    case 'new_schedule':
      return {
        why_short: `${label} is new this year (${cur}) — make sure any companion forms it requires are also present.`,
        why_full: `This schedule did not appear last year. A new Schedule C, for example, should be accompanied by Schedule SE for self-employment tax and may require estimated payments. Verify the supporting forms.`,
        suggested_action: 'Check for required companion schedules and estimated-payment impact.',
      };
    case 'sign_flip':
      return {
        why_short: `${f.reasons[0] ?? `The return swung from ${prior} to ${cur}`} — a reversal this large usually signals a real omission.`,
        why_full: `A sign flip between a refund and a balance due is one of the strongest signals that something material changed: income added, withholding dropped, or a credit or schedule missing. Reconcile the drivers before the client sees a surprise bill.`,
        suggested_action: 'Trace the swing to its cause — income, withholding, credits, or a missing schedule.',
      };
    case 'vanished_income_source':
      return {
        why_short: `${label} of ${prior} reported last year is gone. If the W-2/1099 simply isn't entered yet, income is understated.`,
        why_full: `Income sources rarely disappear without explanation. A job change or closed account is fine — but a missing entry understates total income and can trigger an IRS notice from matched 1099/W-2 data.`,
        suggested_action: 'Confirm whether the income source ended or is just not yet entered.',
      };
    case 'dropped_deduction':
      return {
        why_short: `${label} of ${prior} last year is now ${cur} — if the client still qualifies, that's deduction money left on the table.`,
        why_full: `Recurring deductions that drop to zero are often an omission rather than a real change. At this client's bracket, restoring it could meaningfully lower tax. Worth a quick confirmation with the client.`,
        suggested_action: 'Confirm whether the deduction still applies this year.',
      };
    case 'dropped_carryover_or_depreciation':
      return {
        why_short: `${label} of ${prior} didn't carry forward — carryovers and depreciation are "allowed or allowable", so silently dropping them overstates tax.`,
        why_full: `Capital-loss carryovers and depreciation must be tracked year to year. Losing them not only overstates this year's tax but also complicates basis and future-year calculations.`,
        suggested_action: 'Restore the carryover/depreciation amount from the prior-year return.',
      };
    case 'ratio_proportion_anomaly':
      if (f.subtype === 'itemized_below_standard') {
        return {
          why_short: f.reasons[0] ?? 'Itemized deductions are now below the standard deduction — switching methods lowers tax.',
          why_full: `When itemized deductions fall below the standard deduction, itemizing leaves money on the table. Either a deduction is missing from Schedule A, or the return should switch to the standard deduction.`,
          suggested_action: 'Switch to the standard deduction unless a Schedule A item is missing.',
        };
      }
      if (f.subtype === 'sch_c_se_mismatch') {
        return {
          why_short: f.reasons[0] ?? 'Schedule C and Schedule SE are inconsistent.',
          why_full: `Business income on Schedule C should flow to Schedule SE for self-employment tax. A mismatch usually means SE tax is understated.`,
          suggested_action: 'Ensure Schedule SE is present and reconciles to Schedule C.',
        };
      }
      return {
        why_short: f.reasons[0] ?? `${label} shifted notably relative to a related figure.`,
        why_full: `A ratio between two related lines moved more than expected, which can indicate a data-entry or classification issue even when neither line alone looks alarming.`,
        suggested_action: 'Verify the two lines behind this ratio.',
      };
    case 'filing_status_or_structural_change':
      if (f.subtype === 'ctc_children') {
        return {
          why_short: f.reasons[0] ?? `${label} changed from ${prior} to ${cur} due to a qualifying-children change.`,
          why_full: `The Child Tax Credit dropped because fewer dependents are marked as CTC-qualifying. If a child is still under 17 and qualifies, this is an off-by-one that quietly raises the balance due — exactly the kind of error a busy reviewer signs off on.`,
          suggested_action: "Verify each dependent's CTC eligibility on Schedule 8812.",
        };
      }
      return {
        why_short: f.reasons[0] ?? `${label} changed — this can cascade to many downstream lines.`,
        why_full: `Structural changes (filing status, dependents, deduction method) ripple through the entire return, so they are worth confirming first.`,
        suggested_action: 'Confirm the structural change is intentional.',
      };
    case 'pct_variance_over_threshold':
    case 'absolute_dollar_jump':
      return {
        why_short: `${label} is ${fmtPct(f.pct)} vs last year (${prior} → ${cur}) — past your threshold, so worth confirming the change is real.`,
        why_full: `A swing this size can be legitimate or a data-entry slip (for example, only some 1099s entered). A quick check against source documents resolves it.`,
        suggested_action: 'Reconcile against source documents (W-2s, 1099s, statements).',
      };
    case 'missing_line':
      return {
        why_short: `${label} dropped from ${prior} to ${cur} — confirm whether that's correct.`,
        why_full: `A line populated last year and now empty may be an omission. For payments, fewer dollars means a larger balance due for the client.`,
        suggested_action: 'Confirm the change, or re-enter the missing value.',
      };
    case 'new_from_zero':
      return {
        why_short: `${label} is new this year at ${cur} (was $0 last year).`,
        why_full: `This line was zero last year. New entries are often legitimate but worth a confirming glance for classification.`,
        suggested_action: 'Confirm the new entry is classified correctly.',
      };
    case 'informational_change':
      return {
        why_short: `${label} is ${fmtPct(f.pct)} (${prior} → ${cur}) but under your threshold — likely a normal change such as a raise. Shown for awareness only.`,
        why_full: `This change didn't cross your alerting threshold, so it is surfaced quietly. It's the kind of expected year-over-year drift that shouldn't interrupt your work.`,
        suggested_action: 'No action needed unless it looks wrong.',
      };
    default:
      return {
        why_short: f.reasons[0] ?? `${label} changed from ${prior} to ${cur}.`,
        why_full: f.reasons.join(' '),
        suggested_action: 'Review this line.',
      };
  }
}

const EXPLAIN_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    explanations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding_id: { type: 'string' },
          why_short: { type: 'string', description: '<= 2 sentences, plain English, grounded only in the given values' },
          why_full: { type: 'string', description: '2-4 sentences of deeper rationale' },
          suggested_action: { type: 'string', description: 'one concrete next step for the preparer' },
        },
        required: ['finding_id', 'why_short'],
      },
    },
  },
  required: ['explanations'],
};

interface ClaudeExplanation {
  finding_id: string;
  why_short: string;
  why_full?: string;
  suggested_action?: string;
}

async function claudeExplain(findings: Finding[], verbosity: 'card' | 'full'): Promise<ClaudeExplanation[]> {
  const client = getClient();
  if (!client) throw new Error('no client');
  const compact = findings.map((f) => ({
    finding_id: f.finding_id,
    type: f.anomaly_type,
    subtype: f.subtype,
    label: f.label,
    prior_value: f.prior_value,
    current_value: f.current_value,
    pct: f.pct,
    tier: f.tier,
    reasons: f.reasons,
  }));
  const system =
    'You are CoCounsel, assisting a US individual (Form 1040) tax preparer. For each finding, explain in plain ' +
    'English WHY it matters and what it implies, grounded ONLY in the values provided. Never invent forms, line ' +
    'numbers, or dollar amounts not present. Keep why_short to at most 2 sentences.' +
    (verbosity === 'full' ? ' Also provide a 2-4 sentence why_full and a concrete suggested_action.' : '');
  const msg = await client.messages.create({
    model: MODELS.explain,
    max_tokens: 2048,
    temperature: 0.2,
    system,
    tools: [
      {
        name: 'emit_explanations',
        description: 'Return one grounded explanation per finding.',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: EXPLAIN_TOOL_SCHEMA as any,
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_explanations' },
    messages: [{ role: 'user', content: `Findings:\n${JSON.stringify(compact, null, 2)}` }],
  });
  const out = firstToolInput<{ explanations: ClaudeExplanation[] }>(msg);
  if (!out?.explanations) throw new Error('no explanations');
  return out.explanations;
}

export async function explainFindings(
  _taxpayerId: string,
  findings: Finding[],
  verbosity: 'card' | 'full' = 'card',
): Promise<ExplainResponse> {
  if (claudeAvailable()) {
    try {
      const ex = await claudeExplain(findings, verbosity);
      const map = new Map(ex.map((e) => [e.finding_id, e]));
      return {
        explanations: findings.map((f) => {
          const hit = map.get(f.finding_id);
          if (hit) return hit;
          const t = templateExplain(f);
          return { finding_id: f.finding_id, why_short: t.why_short, why_full: t.why_full, suggested_action: t.suggested_action };
        }),
      };
    } catch {
      // fall through to deterministic templates
    }
  }
  return {
    explanations: findings.map((f) => {
      const t = templateExplain(f);
      return { finding_id: f.finding_id, why_short: t.why_short, why_full: t.why_full, suggested_action: t.suggested_action };
    }),
  };
}
