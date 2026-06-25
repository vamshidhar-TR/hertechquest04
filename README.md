# CoCounsel · Automated Return-to-Return Variance Alerts

> **Hackathon Use Case 5.** Preparers miss anomalies when comparing the current-year return to last year, so errors get caught late in review. As the preparer works, the app compares this year vs last **(just math — not the LLM)** and **speaks up** when a number is materially off or a form is missing — ranked by materiality, each with a plain-English "why" and a **clickable IRS citation**. The kit's stated differentiator is **hands-free voice**: alerts are spoken aloud, and you can **ask a voice follow-up** ("why? what was it last year? is there a rule?") and hear a cited answer back. Runs on the hackathon's **official sample data** (5 clients, including a zero-alert control).

> 📐 **[docs/HACKATHON-BRIEF.md](docs/HACKATHON-BRIEF.md)** maps this build to exactly what the hackathon asks for (the official data, the voice differentiator, the tool choices, and a gap analysis).

![Dashboard](docs/screenshot.png)

---

## Run it

> 📖 New here? **[docs/RUNNING.md](docs/RUNNING.md)** is the full run guide (with troubleshooting). If the tax terms (1040, schedules, refund…) are unfamiliar, **[docs/TAX-FOR-ENGINEERS.md](docs/TAX-FOR-ENGINEERS.md)** explains the whole domain for a software engineer.

```bash
./run.sh
# then open http://localhost:4200
```

Or manually, in two terminals:

```bash
cd backend  && npm install && npm start     # API on :3001
cd frontend && npm install && npm start      # UI on :4200
```

**No API key needed.** The app runs fully on deterministic fallbacks (regex NL parsing + tax-aware template explanations). To light up Claude-powered explanations and natural-language rule parsing:

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # then run.sh
```

The top-bar pill flips from *“Offline · deterministic fallback”* to *“Claude live.”*

---

## The 3-minute demo (the official sample data)

The app loads the kit's five fictional clients (`backend/src/data/returns/`). Each is two consecutive years — last year is the "answer key."

1. **Load Johnson** (TY2024 filed vs TY2025 working). Type (or 🎤 speak) into the bar:
   > *"Flag anything on the Johnson return more than 20% different from last year, and tell me what's missing."*
   It parses to a structured rule (`threshold 20%`, focus *missing*, target *Johnson*) and shows a confirm chip.
2. **Analyze — hands-free.** With **🔊 Hands-free** on, the app *speaks*: *"6 anomalies on the Johnson return. 3 critical, 1 high. Highest priority: Schedule B is missing."* The panel ranks:

   | Flag | Why it matters |
   |---|---|
   | 🔴 **Schedule B is missing** | interest & dividends ($4,100) gone — was filed last year |
   | 🔴 **Form 8283 is missing** | $4,000 noncash charitable contribution no longer reported |
   | 🔴 **Qualified dividends vanished** | $3,600 → $0 — verify the 1099-DIVs are entered |
   | 🟠 **Charitable cash −90%** | $5,000 → $500 — money left on the table (cites **Pub 526**) |
   | 🟡 **Itemized total down**, refund down | downstream effects of the above |

3. **Voice follow-up.** Click **🎤 Ask** on a card → say *"what was it last year?"* or *"is there a rule?"* → it answers aloud and shows the **IRS citation** (clickable).
4. **Control — it doesn't cry wolf.** Switch the client to **Garcia** → **0 alerts**. The kit ships Garcia as a deliberate false-positive check.
5. **Range.** Switch clients to show breadth:
   - **Nguyen** — Schedule C receipts spike +247%, missing **Form 8829** (home office), refund→owe sign flip.
   - **Patel** — a rental property's rents silently drop to **$0** *while Schedule E stays* (a within-form drop, not a missing form).
   - **Thompson** — pick the **year-pair** (3 years on file): wages vanish, pension then Social Security appear across phased retirement.
6. **Tune live.** Drag the **threshold slider** (20% → 30%) and watch lower-priority flags drop off in real time.

**Pitch framing (straight from the kit):** human-in-the-loop (flags only, never files), every flag traceable to an IRS source, and the differentiator is **hands-free voice** — the comparison itself is table stakes.

---

## How it works

```
┌────────────── Angular (signals) ──────────────┐      ┌─────────── Node + Express + TS ───────────┐
│ ReturnGrid (editable, prior vs current)        │ HTTP │ /scan       deterministic two-return walk  │
│ AlertsPanel · AlertCard · DeltaChip · Badge    │◄────►│ /returns    normalized pair + line registry│
│ NlConfigBar (NL + voice) · Threshold slider    │      │ /parse-rule Claude Sonnet  (+ regex)       │
│ VarianceStore (single source of truth)         │      │ /explain    Claude Opus    (+ templates)   │
│ Voice: hands-free TTS + per-card "Ask" (STT)   │      │ /ask        voice follow-up (+ template)   │
└────────────────────────────────────────────────┘      │ /health     reports claude_available       │
                                                         └────────────────────────────────────────────┘
```

The official schema (flat `line_items` + `forms_present`) is mapped into our model by `data/adapter.ts`, so the engine runs unchanged. **The engine is the IP, and it's pure & deterministic** (no LLM in the detection path):

- **13 detectors** — sign flip, missing/new schedule, missing line, vanished income, dropped deduction, dropped carryover/depreciation, %-variance, absolute-$ jump, ratio/consistency, structural change, and a sub-threshold *informational* tier. (The kit's reference `variance_check.py` does just two of these; ours is a superset.)
- **Materiality scoring** — a 0–100 severity blending %-change, log-squashed $-magnitude, and a per-type risk weight, with floors so sign-flips and vanished income never get buried. Sorted into CRITICAL / HIGH / MEDIUM / LOW / INFO.
- **Noise control** — materiality ranking + a suppression cutoff + per-line dedupe keep the panel tight, so the **Garcia control yields 0 alerts** while every other client's planted anomalies surface.
- **Traceability** — every explanation carries a clickable **IRS form/Pub citation**, and every flag jumps to its source line. *An unexplained flag is worse than no flag.*

Claude is layered on top for **plain-English "why it matters"**, **NL rule parsing**, and **voice follow-up answers** — and degrades to deterministic, tax-aware fallbacks when no key is present.

**Docs:**
- [`docs/HACKATHON-BRIEF.md`](docs/HACKATHON-BRIEF.md) — **what the hackathon wants**, the tools, and our gap analysis (read this first)
- [`docs/RUNNING.md`](docs/RUNNING.md) — how to run it, options, and troubleshooting
- [`docs/TAX-FOR-ENGINEERS.md`](docs/TAX-FOR-ENGINEERS.md) — the tax domain (1040, schedules, refund/owe…) explained for a software engineer
- [`docs/SPEC.md`](docs/SPEC.md) — full technical design (detector rules, scoring formula)

---

## Tech & tests

- **Frontend:** Angular 19 (standalone components, signals), zero-dependency Web Speech for voice.
- **Backend:** Node + Express + TypeScript, `@anthropic-ai/sdk` (Sonnet for parsing, Opus for explanations).
- **Tests:** `cd backend && npm test` → Vitest cases assert the official clients — **Garcia raises zero alerts**, Johnson's missing forms + charity collapse fire, Nguyen's spike + missing Form 8829, Patel's within-form rental drop, Thompson's new retirement income + the multi-year selector, plus threshold/NL wiring.

```
solution/
├── shared/types.ts          # one contract, both ends
├── backend/src/
│   ├── registry.ts          # official line_items → form/label/role + tax constants
│   ├── data/
│   │   ├── returns/*.json    # the kit's 5 official clients (11 files)
│   │   └── adapter.ts        # official flat schema → internal TaxReturn
│   ├── engine/              # detect.ts (walk) + rank.ts (score/consolidate)
│   ├── nlparse.ts           # NL → RuleSet (Claude + regex fallback)
│   └── explain.ts           # "why it matters" + citations + /ask follow-up
└── frontend/src/app/        # AppShell + components + VarianceStore + ApiService
```

> Data is the kit's **synthetic** sample data — no real taxpayer PII. The detector heuristics, tax constants, and IRS citations are real; the people aren't.
