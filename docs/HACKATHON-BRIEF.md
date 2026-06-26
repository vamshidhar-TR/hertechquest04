# What the hackathon actually wants — and how our build maps to it

*Derived from the official kit in `reference-docs/` (the HTML tech docs, the `sample_data/` set + `variance_check.py`, and the Use Case 4 build-path doc). This is the "are we building the right thing?" doc.*

> **Naming.** The kit's reference brain is **Thomson Reuters CoCounsel** (an LLM tool reached over MCP). In our build the app is **VeriVance** and its assistant is **Vera** — Vera fills CoCounsel's role, powered by Anthropic models (Claude) via the LiteLLM gateway. Below, *CoCounsel* = the kit's product; *VeriVance* / *Vera* = ours.

---

## 1. The use case in one paragraph

**Use Case 5 — Automated Return-to-Return Variance Alerts.** A tax preparer fills in this year's return. The app loads **last year + this year**, compares them line-by-line **(just math — not the LLM)**, and **speaks up** when a number is materially off or a form is missing — *while the preparer works*, so mistakes are caught before review. If the preparer wants more, they **ask a voice follow-up** ("why? what was it last year? is there a rule?") and **Vera answers aloud with a citation** (that follow-up is Use Case 4). It's **human-in-the-loop** — the tool flags and explains; it never files or changes anything.

## 2. The five things the kit is explicit about

1. **The comparison is "table stakes." Voice is the differentiator.**
   > *"Every tool above [Juno, CCH Axcess, Drake] makes you look at a screen… None speak the alert, and none let you ask a voice follow-up. UC5's edge is hands-free delivery… Build that part — the comparison itself is table stakes."*
2. **Deterministic math, LLM for words.**
   > *"Let the assistant do the unstructured work (explanations). Let your own code do the deterministic variance math. Don't ask the LLM arithmetic you can compute exactly."*
3. **The brain (the kit's CoCounsel) is the optional follow-up, reached over MCP — and it's interchangeable.** *"CoCounsel is an LLM-powered legal tool."* The kit's `answer(question)` seam lets you point at CoCounsel-over-MCP, a REST API, or a local model without touching the voice UI. In our build, **Vera** fills this role.
4. **Traceability is non-negotiable.** *"Every flagged number links back to its source line. In tax, an unexplained flag is worse than no flag."*
5. **The 20% threshold is a tunable demo choice**, not an industry standard (the IRS audit manual references ~5%).

## 3. The official sample data (what judges test with)

`reference-docs/.../sample_data/` — **5 fictional clients, flat schema** (`client`, `demographics`, `tax_year`, `forms_present`, `line_items`, `_meta.planted_anomalies`). The reference `variance_check.py` auto-discovers files, groups by `client_id`, and compares consecutive years.

| Client | Scenario | What it exercises |
|---|---|---|
| **Johnson** (MFJ) | Charitable drop + dropped schedules | big % variance + **missing forms** (Schedule B, Form 8283) |
| **Nguyen** (Sch C) | Business income spike | large **upward** swings + missing Form 8829 |
| **Patel** (rental) | One rental sold | **within-form** line drop (Sch E stays, a line → 0) |
| **Garcia** (single) | Normal year | **CONTROL — must raise ZERO alerts** (false-positive check) |
| **Thompson** (3 yrs) | Phased retirement | **multi-year**, new income lines appearing |

**We load all five directly** (`backend/src/data/returns/`), via an adapter that maps the official schema into our engine. **Garcia produces 0 alerts**, every other client's planted anomalies surface.

## 4. Tools — the kit's menu vs. our choices

The kit is explicit: *"Each tool is optional… none is required to finish the hackathon."* Minimal suggested path: an editor + Whisper for speech + CoCounsel over MCP + a git repo.

| Kit building block | What it's for | Our choice | Why |
|---|---|---|---|
| VS Code / Cursor / Codex | editor / AI pair | (your editor) | n/a — tooling, not the app |
| **LLM brain** | explanations, Q&A | **Vera** via `@anthropic-ai/sdk` — direct key **or the TR LiteLLM gateway** (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`) — + deterministic fallback | kit says the brain is interchangeable; LiteLLM means no direct Anthropic key needed, and it runs offline-degraded for a safe live demo |
| **MCP → CoCounsel** | cited tax-rule answers | **documented as an optional swap** behind our `answer()` seam (`ApiService`); today Vera fills the role | their Tax MCP endpoint + 30–60s OAuth research calls are a live-demo risk; our `/api/ask` + `/api/explain` is the same seam |
| **Whisper / Parakeet** (STT) | speech → text, on-device | **browser Web Speech** (SpeechRecognition) | zero-install, instant demo. **Tradeoff:** browser STT is cloud-based, not on-device-private — see below |
| **Kokoro / Piper** (TTS) | speak answers | **browser Web Speech** (SpeechSynthesis) | same — zero-install |
| git | version control | yes (branch `align-official-data`) | — |

**Honest tradeoff — voice privacy.** The kit prefers on-device STT/TTS because spoken queries can contain client data. Our browser Web Speech is zero-install but sends audio to the browser's cloud STT. For a demo that's fine; for production you'd swap in faster-whisper + Piper behind the same voice interface. We call this out rather than hide it.

## 5. Gap analysis — where we were vs. now

| Requirement | Before alignment | After (this branch) |
|---|---|---|
| Comparison engine | ✅ exceeds (13 detectors, scoring, tiers) | ✅ unchanged — runs on official data via adapter |
| Works with **official sample data** | ❌ our own schema + clients | ✅ all 5 official clients load; Garcia control = 0 |
| **Speaks alerts** hands-free | ⚠️ manual button only | ✅ hands-free toggle auto-speaks the ranked summary on each analyze |
| **Voice follow-up Q&A** | ❌ none | ✅ per-card "🎤 Ask" → STT → `/api/ask` → spoken, **cited** answer |
| **Citations / traceability** | ⚠️ jump-to-line only | ✅ every explanation carries an IRS form/Pub citation (clickable) + jump-to-line |
| Deterministic math, LLM for words | ✅ | ✅ (matches the kit's prescribed architecture) |
| Human-in-the-loop | ✅ (flags only, never files) | ✅ |
| Multi-year (Thompson) | ❌ | ✅ year-pair selector |

## 6. The demo (aligned to the official data)

1. **Load Johnson.** Two columns: TY2024 (filed) vs TY2025 (working). Type/speak the config: *"Flag anything on the Johnson return more than 20% different, and tell me what's missing."*
2. **Analyze.** With **Hands-free on**, the app *speaks*: *"6 anomalies on the Johnson return. 3 critical, 1 high. Highest priority: Schedule B is missing."* The panel ranks: **missing Schedule B**, **missing Form 8283**, **qualified dividends vanished**, **charitable cash −90%**, itemized total down, refund down.
3. **Voice follow-up.** Click **🎤 Ask** on the charity card → say *"is there a rule?"* → it speaks back and shows the **citation (IRS Pub 526)**.
4. **Control.** Switch the client to **Garcia** → **0 alerts** ("it doesn't cry wolf"). This is the false-positive check the kit ships on purpose.
5. **Range.** Switch to **Nguyen** (business spike + missing Form 8829), **Patel** (a rental line silently drops to $0 while Schedule E stays), **Thompson** (pick the year-pair → wages vanish, pension/Social-Security appear across retirement).

**Pitch framing (from the kit):** human-in-the-loop, every flag is traceable to a source, and the differentiator is hands-free voice — not the comparison.

## 7. Optional next steps (if you want even tighter alignment)

- **Swap in the real Thomson Reuters CoCounsel over MCP** behind `/api/ask` for authoritative cited answers (needs the Tax MCP endpoint + OAuth login).
- **On-device voice** (faster-whisper + Piper) behind the same voice interface for private audio.
- **PDF ingestion** (the kit's UC4 phase-2): the `reference-docs/` 1120 PDFs + `northwind_1120_sample.json` show a corporate variant — Vera could extract line items from PDFs into our schema.

> Data is **synthetic** (the kit's own fictional clients). The detector heuristics, tax constants, and citations are real; the people aren't.
