/**
 * Natural-language / voice rule parsing → validated RuleSet.
 *
 * With an API key: AI (Sonnet) does bounded language→enum extraction via forced tool-use.
 * Without one: a deterministic regex/keyword parser handles the demo phrases. Either way,
 * deterministic code resolves the taxpayer, validates/clamps, and builds the echo-back.
 */
import type { ParseRuleResponse } from '../../shared/types.js';
import { DEFAULT_RULESET } from '../../shared/types.js';
import { MODELS, aiAvailable, temperatureParam } from './config.js';
import { callAI, getClient, firstToolInput } from './ai.js';
import { resolveTaxpayerByName } from './data/index.js';
import { fmtMoney } from './engine/util.js';
import { RuleExtract, RULESET_TOOL_SCHEMA, resolveRuleSet } from './schemas.js';

function regexExtract(text: string): RuleExtract {
  const lower = text.toLowerCase();

  let pct: number | null = null;
  const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  if (pctMatch) pct = parseFloat(pctMatch[1]) / 100;
  else if (/\b(a\s+)?third\b/.test(lower)) pct = 0.33;
  else if (/\b(a\s+)?quarter\b/.test(lower)) pct = 0.25;
  else if (/\bhalf\b/.test(lower)) pct = 0.5;
  else if (/\bdoubl/.test(lower)) pct = 1.0;

  let minAbs: number | null = null;
  const dollarMatch = lower.match(/\$\s*([\d,]+)(k)?/);
  if (dollarMatch) {
    minAbs = parseInt(dollarMatch[1].replace(/,/g, ''), 10) * (dollarMatch[2] ? 1000 : 1);
  }

  const focus = new Set<string>();
  if (/missing|absent|gone|left out|what'?s? missing|dropped schedule|forgot/.test(lower)) focus.add('missing');
  if (/dropped deduction|deduction|left on the table|write-?off/.test(lower)) focus.add('dropped');
  if (/refund|owe|balance due|sign flip/.test(lower)) focus.add('sign');
  if (/new schedule|started a|added a|new business/.test(lower)) focus.add('new');

  return {
    pct_threshold: pct,
    min_abs_dollars: minAbs,
    focus: [...focus],
    target_name: null,
  };
}

async function aiExtract(text: string): Promise<RuleExtract> {
  const client = getClient();
  if (!client) throw new Error('no client');
  return callAI('NL rule parse (/api/parse-rule)', MODELS.parse, async () => {
    const msg = await client.messages.create({
      model: MODELS.parse,
      max_tokens: 512,
      ...temperatureParam(),
      tools: [
        {
          name: 'emit_rule_config',
          description:
            'Map a tax preparer\'s natural-language alerting instruction into a structured rule config. ' +
            'Only map language to the given fields. Do NOT invent thresholds (leave null if unstated). Do NOT compute.',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: RULESET_TOOL_SCHEMA as any,
        },
      ],
      tool_choice: { type: 'tool', name: 'emit_rule_config' },
      messages: [
        {
          role: 'user',
          content: `Preparer instruction: "${text}"\n\nEmit the rule config that captures it.`,
        },
      ],
    });
    const extract = firstToolInput<RuleExtract>(msg);
    if (!extract) throw new Error('no tool output in response');
    return extract;
  });
}

function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase();
}

function buildEcho(
  threshold: number,
  minAbs: number,
  focus: string[] | undefined,
  resolvedId: string | null,
): string {
  const who = resolvedId ? `the ${titleCase(resolvedId)} return` : 'the loaded return';
  let echo = `Flagging anything on ${who} more than ${Math.round(threshold * 100)}% different from last year`;
  if (minAbs && minAbs !== DEFAULT_RULESET.min_abs_dollars) echo += ` and at least ${fmtMoney(minAbs)}`;
  const tags: string[] = [];
  if (focus?.includes('missing')) tags.push('missing schedules & income');
  if (focus?.includes('dropped')) tags.push('dropped deductions');
  if (focus?.includes('sign')) tags.push('refund↔owe swings');
  if (focus?.includes('new')) tags.push('new schedules');
  if (tags.length) echo += `, with a focus on ${tags.join(', ')}`;
  return echo + '.';
}

export async function parseRule(text: string, loadedTaxpayerIds: string[]): Promise<ParseRuleResponse> {
  let extract: RuleExtract;
  let parsedVia: 'ai' | 'regex_fallback';
  if (aiAvailable()) {
    try {
      extract = await aiExtract(text);
      parsedVia = 'ai';
    } catch {
      extract = regexExtract(text);
      parsedVia = 'regex_fallback';
    }
  } else {
    extract = regexExtract(text);
    parsedVia = 'regex_fallback';
  }

  // Resolve the taxpayer: AI's named target, else scan the raw text, else the only loaded one.
  let resolved = extract.target_name ? resolveTaxpayerByName(extract.target_name) : null;
  resolved ??= resolveTaxpayerByName(text);
  if (!resolved && loadedTaxpayerIds.length === 1) resolved = loadedTaxpayerIds[0];

  const ruleset = resolveRuleSet({
    target: resolved,
    pct_threshold: extract.pct_threshold ?? undefined,
    min_abs_dollars: extract.min_abs_dollars ?? undefined,
    enabled_types: extract.enabled_types,
    focus: extract.focus,
  });

  return {
    ruleset,
    resolved_taxpayer_id: resolved,
    echo_back: buildEcho(ruleset.pct_threshold, ruleset.min_abs_dollars, ruleset.focus, resolved),
    needs_clarification: false,
    clarification_question: null,
    parsed_via: parsedVia,
  };
}
