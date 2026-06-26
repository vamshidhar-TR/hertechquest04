# Running the app

VeriVance · Return-to-Return Variance Alerts is a two-part app:

| Part | What it is | URL |
|---|---|---|
| **Backend** | Node + Express API (the detection engine) | http://localhost:3001 |
| **Frontend** | Angular dashboard (what you look at) | http://localhost:4200 |

You open the **frontend** in your browser; it talks to the backend behind the scenes.

---

## Prerequisites

- **Node.js 22+** and **npm** (check with `node --version`).
- That's it. **No API key, no database, no internet needed** — the app ships with synthetic data and runs fully offline.

---

## Quick start (one command)

From the `solution/` folder:

```bash
./run.sh
```

This installs dependencies on the first run, then starts both servers. When it prints `Open http://localhost:4200`, open that in your browser. Press **Ctrl-C** to stop everything.

---

## Manual start (two terminals)

If you'd rather run them separately (handy for seeing logs):

```bash
# Terminal 1 — backend API
cd backend
npm install        # first time only
npm start          # → http://localhost:3001

# Terminal 2 — frontend UI
cd frontend
npm install        # first time only
npm start          # → http://localhost:4200
```

Then open **http://localhost:4200**.

> The frontend dev server takes ~10–20 seconds to compile the first time. If the page looks blank, wait a moment and refresh.

---

## What you should see

The **Johnson** client (the kit's official sample) loads automatically with **6 ranked alerts** in the
right-hand panel: a **missing Schedule B**, a **missing Form 8283**, vanished dividends, a charitable-cash
collapse, and downstream effects. Try these:

- **Toggle 🔊 Hands-free** (top of the panel) and click **Analyze** → the app *speaks* the ranked summary aloud.
- **Click 🎤 Ask** on a card → say *"what was it last year?"* or *"is there a rule?"* → it answers aloud, with the **IRS citation** shown.
- **Drag the threshold slider** (bottom bar) up to 30% → lower-priority flags drop off live.
- **Click "Why it matters"** → plain-English explanation + suggested action + source citation. **"Jump to line"** highlights it in the grid.
- **Switch the client dropdown** (top bar): **Garcia** → *zero alerts* (the control); **Nguyen / Patel / Thompson** → other scenarios. **Thompson** shows a **year-pair picker** (3 years on file).
- **Type in the bottom bar** (or click 🎤): *"Flag anything on the Johnson return more than 20% different from last year, and tell me what's missing"* → **Analyze**.

---

## Optional: turn on Vera

By default the AI features run on built-in deterministic fallbacks (template explanations + regex rule parsing) — the top-right pill reads *"Offline · deterministic fallback."*

To enable Vera-powered explanations and natural-language parsing, set credentials **before** starting. Two options:

**A) Thomson Reuters LiteLLM gateway** (no direct Anthropic key — uses a bearer virtual key):

```bash
export ANTHROPIC_BASE_URL=https://litellm.int.thomsonreuters.com
export ANTHROPIC_AUTH_TOKEN=<your-litellm-virtual-key>
export ANTHROPIC_MODEL=anthropic/claude-opus-4-7   # match the name your gateway registers
./run.sh
```

**B) Direct Anthropic:**

```bash
export ANTHROPIC_API_KEY=sk-ant-…
./run.sh
```

The pill flips to *"Vera live."* Everything still works without either — credentials only enrich the wording. If a model name is rejected, set `ANTHROPIC_MODEL` (or `ANTHROPIC_MODEL_EXPLAIN` / `ANTHROPIC_MODEL_PARSE`) to whatever your gateway exposes.

---

## Running the tests

The detection engine has a unit-test suite (27 cases):

```bash
cd backend
npm test
```

It asserts the six headline Johnson flags fire at the right severities, the Schedule C cascade consolidates into one card, the wages change stays "Info," threshold changes take effect, and the synthetic data reconciles arithmetically.

---

## Stopping the app

- If you started with `./run.sh` or the manual terminals: press **Ctrl-C** in each.
- To force-kill by port:
  ```bash
  # find and stop whatever holds the ports
  lsof -ti:3001 | xargs -r kill      # backend
  lsof -ti:4200 | xargs -r kill      # frontend
  ```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **Page is blank / stuck "Loading…"** | The dev server is still compiling, or the backend isn't up. Wait ~15s and refresh; confirm `curl http://localhost:3001/api/health` returns JSON. |
| **Alerts panel is empty / "No alerts"** | The backend isn't reachable. Make sure `npm start` is running in `backend/` and that `:3001` responds. |
| **"port already in use" (EADDRINUSE)** | Something is already on 3001 or 4200. Kill it (see *Stopping* above) or change the port: backend `PORT=3002 npm start`; frontend `npm start -- --port 4300` (and update the URL). |
| **`npm install` fails / wrong Node version** | Use Node 22+. The frontend deliberately uses Angular 19 (compatible with Node 22.x); newer Angular CLI needs Node 22.22+. |
| **Fonts look plain** | Harmless — the UI loads Inter from Google Fonts; with no internet it falls back to system fonts. |

---

## Project layout (where things live)

```
solution/
├── run.sh                     # starts both servers
├── README.md                  # overview + the demo script
├── docs/
│   ├── HACKATHON-BRIEF.md     # what the hackathon wants + tools + gap analysis
│   ├── RUNNING.md             # (this file)
│   ├── TAX-FOR-ENGINEERS.md   # the tax domain, explained for a software engineer
│   └── SPEC.md                # full technical design
├── shared/types.ts            # the API contract, used by both ends
├── backend/                   # Node + Express + TypeScript
│   └── src/
│       ├── registry.ts        # which tax lines exist + which form each belongs to
│       ├── data/returns/      # the kit's 5 official synthetic clients (JSON)
│       ├── data/adapter.ts    # official schema → internal model
│       ├── engine/            # detect.ts (the diff) + rank.ts (the scoring)
│       ├── nlparse.ts         # natural-language → rule
│       └── explain.ts         # "why it matters" text
└── frontend/                  # Angular 19 dashboard
    └── src/app/
        ├── core/              # ApiService + VarianceStore (state)
        └── components/        # the grid, alert cards, config bar, etc.
```
