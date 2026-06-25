# CoCounsel — Automated Return-to-Return Variance Alerts

> **⚠️ Alignment note.** This is the *original* engine/UX design. After the hackathon's official kit
> arrived, the app was aligned to the **official sample-data schema** (flat `line_items` + `forms_present`,
> 5 clients incl. a Garcia control) and the **voice-first** framing. The detector taxonomy, materiality
> scoring, API, and component design below all still apply; what changed is the **input schema** (now
> mapped by `backend/src/data/adapter.ts`), the **clients/demo**, and added **voice follow-up + citations**.
> For the current intent, data, tools, and gap analysis, read **[HACKATHON-BRIEF.md](HACKATHON-BRIEF.md)**.
> §1 (data model) and §7 (demo) below describe the original synthetic data and are superseded by the brief.

**Hackathon Use Case 5.** CoCounsel monitors a current-year (work-in-progress) individual Form 1040 return against the taxpayer's prior-year return and proactively surfaces anomalies *before* the return goes to review — variances over a configurable threshold (default 20%), missing schedules, dropped deductions, sign flips, and vanished income — each explained in plain English and ranked by materiality so the preparer isn't drowned in noise.

> Voice/NL config: *"Flag anything on the Johnson return more than 20% different from last year, and tell me what's missing."*

**Stack:** Angular (standalone, signals) frontend · Node + Express + TypeScript backend · Claude API (`@anthropic-ai/sdk`) for explanations + NL→rule parsing, with deterministic fallbacks so the demo runs offline. Data is synthetic (no real taxpayer PII).

---

## 1. Data model

Hierarchical return JSON, engine-consumed:

```
TaxReturn
 ├─ taxpayer_id, display_name, tax_year
 ├─ header { filing_status, num_dependents, num_qualifying_children_ctc, deduction_method }
 └─ forms { <formId>: { present: bool, lines: { <line>: { value: number|null } } } }
```

- `present: false` → the schedule is absent from the return.
- `value: null` → not entered (drives missing/vanished detection); `value: 0` → a real zero.
- **Labels and roles are NOT in the input data.** A shipped **static line registry** maps each `form.line` canonical path → `{ label, role, flags }`. This keeps seed data clean and detection logic data-driven.
- Both years flatten to a dict keyed by `canonical_path` (`"1040.1a"`) for O(1) key-union diffing.
- Year-specific constants (standard deduction, SALT cap, EITC investment limit, CTC phase-out) live in `tax_constants[year]` config — never hard-coded into logic.

## 2. Detector taxonomy (12)

| Detector | Default tier | Fires when |
|---|---|---|
| `sign_flip` | CRITICAL | Net outcome flips sign (refund↔owe; profit↔loss). Always-fire, severity floored ≥70. |
| `missing_schedule` | CRITICAL | Schedule nonzero in prior, absent/empty in current. Rolls up & suppresses child line findings. |
| `vanished_income_source` | CRITICAL | An income line ≥$1,000 in prior is null/~0 in current. Always-fire, floored ≥70. Substitution dampener if a comparable new source appeared. |
| `dropped_carryover_or_depreciation` | CRITICAL | Cap-loss carryover (Sch D 6/14) or Sch E depreciation present prior, gone current. Silent & high-dollar. |
| `dropped_deduction` | HIGH | Recurring deduction line nonzero prior, 0/null current (framed as client money left on the table). |
| `missing_line` | HIGH | Parent schedule present but a nonzero prior line is null/0 in current. |
| `pct_variance_over_threshold` | HIGH | Both nonzero, `|pct| ≥ threshold` (default 0.20) AND `|Δ$| ≥ min_abs` (default $500). |
| `absolute_dollar_jump` | HIGH | `|Δ$|` ≥ tiered floor (totals $25k / subtotals $10k / lines $5k). Fires independent of %, merges with pct finding. |
| `ratio_proportion_anomaly` | HIGH | Registry of ratios (deduction/AGI, effective rate, withholding/income…) shifts ≥30% or crosses a hard bound. Includes consistency pairs: Sch C XOR Sch SE; itemized < standard deduction; Sch B vs 1040 totals. |
| `filing_status_or_structural_change` | HIGH/context | Header scalars change (filing status, dependents, CTC children, deduction method). Runs FIRST so others can reference it. |
| `new_schedule` | MEDIUM | Schedule present+nonzero in current, absent in prior. New Sch C → expects Sch SE. |
| `new_from_zero` | LOW | Leaf nonzero current, null/0 prior, parent already existed. |

## 3. Materiality scoring

A single 0–100 `severity` per finding (deterministic, **no LLM in this path**):

```
pct_component  = pct==null ? 1.0 : min(|pct| / 1.0, 1.0)          # 100% change saturates
abs_component  = min( log10(1+|Δ$|) / log10(1+250_000), 1.0 )      # log squash; $250k saturates
risk_weight    = static table by anomaly_type (+ role multipliers, clamped [0,1])

severity = round( 100 * (0.25·pct + 0.35·abs + 0.40·risk) / (0.25+0.35+0.40) )
```

Risk weights: `sign_flip 1.0`, `vanished_income 0.95`, `dropped_carryover 0.92`, `missing_schedule 0.90`, `structural 0.90`, `new_schedule 0.75`, `ratio 0.70`, `missing_line/dropped_deduction 0.65`, `abs_jump 0.60`, `pct_variance 0.50`, `new_from_zero 0.45`. Role multipliers (additive, clamped): income +0.10, tax/result +0.10, total +0.05, credit +0.05.

- **Floors:** `sign_flip` & `vanished_income_source` floored at severity ≥70 (never buried).
- **Tiers:** CRITICAL ≥75 · HIGH 55–74 · MEDIUM 35–54 · LOW <35. (`INFO` for benign sub-threshold context.)
- **Sort/suppress:** sort by severity desc, tie-break |Δ$| then risk_weight. Suppress < cutoff (30) into an audit count unless `always_material`. Dedupe a node firing multiple types into one finding (max severity, `reasons[]`). `missing_schedule` rolls up its child lines. Cap at `max_findings` (15); rest shown as "+N more".

## 4. API (Express)

| Method · Path | Purpose | Claude? |
|---|---|---|
| `GET /api/health` | Liveness + `claude_available` + available taxpayers | — |
| `GET /api/returns/:taxpayer_id` | Normalized prior+current pair + registry for the grid | — |
| `POST /api/returns/load` | Load a pair (seed id or uploaded JSON) | — |
| `POST /api/scan` | Deterministic two-return walk + ranking. Called on analyze, on each debounced grid edit, on threshold change | — |
| `POST /api/parse-rule` | NL/voice text → validated `RuleSet` | Sonnet (+ regex fallback) |
| `POST /api/explain` | Plain-English "why it matters" for a batch of findings | Opus (+ template fallback) |

`/api/scan` request carries `current_override` (edited grid lines) + optional `ruleset`; response is `{ summary{by_tier,suppressed}, findings[] }` with `explanation:null` (filled by `/api/explain` a beat later).

## 5. Claude integration

- **`/api/parse-rule`** — `claude-sonnet-4-6`, one Messages call, single forced tool `emit_rule_config` (input_schema = RuleSet), `temperature: 0`. Claude does **only** language→enum mapping (`"more than 20% different"` → `pct_threshold: 0.20`; `"what's missing"` → focus missing/dropped; `"Johnson return"` → taxpayer match). It must not invent thresholds or compute. Deterministic code validates, clamps, fills defaults, resolves the taxpayer, and builds the `echo_back`.
- **`/api/explain`** — `claude-opus-4-8`, batched call **after** deterministic detection+ranking (Claude is never in the detection path). Forced-tool JSON for `why_short` (≤2 lines), optional SSE for `why_full` + `suggested_action`. Grounded in real tax meaning (missing W-2/1099, dropped carryover "allowed or allowable", Schedule C without SE understating SE tax); forbidden from inventing forms, line numbers, or dollar figures not in the finding.
- **Resilience** — deterministic regex/keyword parser + templated tax-aware explanations when `ANTHROPIC_API_KEY` is absent; `health.claude_available` drives UI degradation (hides voice).

## 6. Angular components

`AppShellComponent` (CSS-grid: top bar · left return workspace ~58% · right alerts panel ~42%) · `FormTabsComponent` (count badges) · `ReturnGridComponent` (editable 4-col grid: Line | Description | Prior | Current, gutter severity dots, `jumpToLine`) · `AlertsPanelComponent` (filter chips, sort) · `RiskSummaryHeaderComponent` (aria-live) · `AlertCardComponent` (severity stripe, anchor chip, delta, why, accept/dismiss/explain/jump) · `DeltaChipComponent` · `SeverityBadgeComponent` · `ExplainDrawerComponent` (lazy, SSE) · `NlConfigBarComponent` · `ThresholdControlComponent` (slider → live re-scan) · `VarianceStore` (signal service, single source of truth, optimistic recompute + debounced reconcile) · `ApiService` · `VoiceController` (Web Speech; demo polish) · `ToastService`.

## 7. The Johnson demo (final, reconciled numbers)

Michael & Sarah Johnson, MFJ, 2 kids, Ohio. Michael W-2 engineer; Sarah ran a part-time Schedule C design business. **TY2023 filed** baseline vs **TY2024 WIP** (started from a proforma carry-forward — exactly why missing items slip through).

| 1040 line | TY2023 | TY2024 WIP |
|---|---|---|
| 1a Wages | 142,000 | 158,000 (legit +11% raise) |
| 2b Interest | 1,250 | 1,400 |
| 3b Ordinary dividends | 3,400 | **480** |
| 7 Capital gain (Sch D) | 6,800 | 7,100 |
| 8 Other income (Sch 1 → Sch C) | 18,500 | **0** |
| 9 Total income | 171,950 | 166,980 |
| 11 AGI | 170,643 | 166,980 |
| 12 Deduction (itemized) | 31,800 | **24,300** |
| 15 Taxable income | 138,843 | 142,680 |
| 16 Tax | 21,160 | 21,496 |
| 19 Child Tax Credit (Sch 8812) | 4,000 | **2,000** |
| 24 Total tax | 17,160 | 19,496 |
| 25 Withholding | 19,600 | 17,750 |
| 33 Total payments | 21,600 | 17,750 |
| 34/37 **Outcome** | **Refund 4,440** | **Owe 1,746** |

Schedules prior: A, B, C, D, SE, 8812. Current: A, B, D, 8812 (**C and SE gone**).

**Six showcased flags (ranked):**
1. **Missing Schedule C** — $18,500 business income + Schedule SE gone (cascades to missing SE tax = silent under-reporting). *headline*
2. **Sign flip** — refund $4,440 → owe $1,746 ($6,186 swing). *loud symptom*
3. **Dividends −86%** — $3,400 → $480 (3 of 4 1099-DIVs un-entered). *the literal ">20% different"*
4. **Dropped charity** — $7,500 → $0 (~$1,650 left on the table at their bracket).
5. **Itemized below standard** — itemized $24,300 < 2024 MFJ standard $29,200 → should switch methods.
6. **CTC off-by-one** — $4,000 → $2,000; 2 kids still dependents but only 1 flowed to 8812. *the subtle catch a tired reviewer signs off on*

De-prioritized: **Wages +11%** ($142k→$158k) shown **Informational** below the fold — proves the tool ranks by materiality and doesn't cry wolf.

**Demo beats (~3 min):** setup (two columns) → type NL config (Sonnet parses → echo-back chip) → Analyze (right rail ranks the six) → live edit Sch C back to $18,500 (grid recomputes, SE tax appears, sign-flip card updates) → voice ("read me the most important issue" → TTS) → payoff (CTC card: $2,000 silently lost, no total looks wrong) → close (wages shown as quiet Informational — "it knows what NOT to bother you with").

## 8. Build order & cut list

**Do-not-cut spine:** the deterministic two-return walk + materiality scoring (the real IP), the corrected Johnson seed data (must reconcile or a CPA judge catches it), the static line registry.

Cut order if time runs short: (1) Voice → (2) SSE streaming of full explanation → (3) Claude NL parsing (ship regex fallback) → (4) reduce to the 5 demo-carrying detectors → (5) live optimistic recompute (replace with a "Re-scan" button) → (6) virtual scroll & animations.

**Risks mitigated:** tax-math credibility (all Line 16 recomputed to real 2023/2024 MFJ brackets; sign flip preserved via realistic under-withholding); API latency in a live demo (offline fallbacks + pre-warmed Johnson explanations).
