# The tax domain, explained for a software engineer

You don't need to know anything about taxes to understand this project. The engineering is the
interesting part; the tax stuff is just a dictionary. This doc is that dictionary.

---

## The 30-second version

We built **a linter + diff tool for tax returns.**

- **Last year's** finished return = the **baseline**.
- **This year's** in-progress return = the **new version / the diff**.
- Our tool **diffs them, flags suspicious changes, ranks them by severity, and explains each one** —
  so a human catches mistakes *before* they ship to review.

Think: a CI check that flags regressions before merge, with Sev1/Sev2/Sev3 priorities and a
plain-English reason on each finding.

---

## What's a tax return?

Once a year, every American tells the government (the **IRS**) how much money they made and
calculates how much tax they owe, by filling out **forms**. That bundle of forms = a **tax return**.

> Mental model: a tax return is **one big structured document — a giant JSON object full of
> numbered fields.** That's literally how we model it in `backend/src/data/*.json`.

## Who's the "client"?

The person (or family) whose return is being filled out. A professional **tax preparer** (an
accountant) does this for *many* clients. **The user of our app is the preparer**, switching between
clients with the top-bar dropdown.

Our two synthetic clients (made-up — no real data):
- **Michael & Sarah Johnson** — a married couple with two kids.
- **Robert Smith** — a single filer.

## Form 1040 — the main form (the "root object")

Every individual return centers on **Form 1040**. It's the summary page where everything adds up to
the final answer: *do you get money back (a refund) or do you owe?* It has numbered **lines**
(fields):

| Line | What it is | Think of it as |
|---|---|---|
| 1a | Wages from your job | `income.wages` |
| 2b | Interest earned | `income.interest` |
| 3b | Dividends from investments | `income.dividends` |
| 8 | Other income (from Schedule 1) | a sub-total fed by a schedule |
| 9 | **Total income** | a computed sum |
| 11 | **AGI** (adjusted gross income) | income after certain deductions |
| 12 | Deduction (standard or itemized) | what you subtract before tax |
| 15 | Taxable income | what tax is actually calculated on |
| 16 | Tax | the calculation |
| 19 | Child Tax Credit | money back for having kids |
| 24 | Total tax owed | the final tax number |
| 25 | Tax already withheld from paychecks | what you prepaid |
| 34 / 37 | **Refund / Amount you owe** | **the bottom line** |

So "**1040 Line 1a**" is just `form1040.lines["1a"]` — a specific field. In our code, every field has a
canonical path like `"1040.1a"`.

## Schedules — optional attachments (think "plugins")

You only attach the schedules relevant to your situation. Each is its own little form with its own
lines, and **its numbers feed up into the 1040.**

| Schedule | For people who… | Plain meaning |
|---|---|---|
| **Schedule 1** | have extra income/adjustments | a "miscellaneous income" attachment |
| **Schedule A** | itemize deductions | list out deductions (mortgage interest, charity, state taxes) instead of taking the flat "standard" amount |
| **Schedule B** | have lots of interest/dividends | investment-income detail |
| **Schedule C** | run a small business / freelance | business profit & loss |
| **Schedule D** | sold stocks | capital gains/losses |
| **Schedule E** | own rentals | rental income |
| **Schedule SE** | have Schedule C income | the *extra* "self-employment tax" you owe on business income |
| **Schedule 8812** | have kids | the Child Tax Credit (money back per qualifying child) |

### Schedules form a dependency graph

This is the key insight that shapes our engine. Numbers flow **up**:

```
Schedule C (business profit)  ──►  Schedule 1  ──►  1040 line 8 (income)
Schedule C  ──► requires ──►  Schedule SE (self-employment tax)  ──►  1040 line 23 (more tax)
Schedule A (itemized total)   ──►  1040 line 12 (deduction)
Schedule 8812 (child credit)  ──►  1040 line 19 (credit)
```

That's why, when the Johnson return is **missing Schedule C**, our tool doesn't fire five separate
alerts (income gone, SE tax gone, Schedule SE gone, …). It **rolls the whole cascade into one card** —
because in the dependency graph, they all trace back to one root cause. (See the consolidation logic
in `backend/src/engine/rank.ts` and the relationships in `backend/src/registry.ts`.)

## Refund vs. owe (the bottom line)

During the year, tax is automatically **withheld** from each paycheck. At tax time you reconcile:

- Prepaid **more** than you owe → **refund** (money back).
- Prepaid **less** → **you owe** (a bill).

A refund suddenly flipping to "you owe" is a huge red flag — like a green build going red. Our
engine treats that "sign flip" as one of the highest-severity detectors.

---

## The problem we actually solve

A preparer does *hundreds* of returns. For most clients, **this year looks a lot like last year** —
same job, same house, same kids. So a return is usually built by copying last year's and updating
the numbers.

The danger: when something **silently fails to carry over** — a whole schedule gets dropped, a
deduction forgotten, only half the data entered — the preparer often **doesn't notice**, because no
single number screams "error." It gets caught late in review, or not at all (costing the client money
or triggering an IRS notice).

**This is a regression.** Last year = the passing baseline. This year = the diff. We're the **CI check
that flags regressions before merge** — with severity levels and a plain-English explanation of each.

---

## What our app does (mapping to the screen)

1. **Loads two versions** of a client's return — last year (filed) + this year (in progress).
2. **Diffs them line-by-line** → the left **grid** ("TY2023 filed" vs "TY2024 working").
3. **Runs ~13 detectors** (lint rules): big % change, missing schedule, dropped deduction, the
   refund→owe flip, etc.
4. **Scores & ranks** each finding by **materiality** (= alert priority) so the scary stuff floats up
   and trivial noise is suppressed.
5. **Explains each one in plain English** → the right **alerts panel**. ("CoCounsel" is Thomson
   Reuters' AI-assistant brand.)
6. **Configurable in natural language / voice** ("flag anything >20% different"), parsed into a rule.

---

## The Johnson demo, decoded

**Last year**, the Johnsons had: Michael's salary + Sarah's small design business (Schedule C) +
some investments + two kids → a **$4,440 refund**.

**This year** (work in progress), whoever started the return made several silent mistakes:

| What went wrong | What our tool catches |
|---|---|
| ❌ Forgot Sarah's whole business | **Schedule C is missing** — $18,500 income gone, plus its self-employment tax |
| ❌ Entered only 1 of 4 dividend statements | **Dividends −86%** ($3,400 → $480) |
| ❌ Forgot the $7,500 charity donation | **Dropped deduction** ($7,500 → $0) |
| ❌ Marked only 1 of 2 kids for the child credit | **Child credit halved** ($4,000 → $2,000) — an off-by-one |
| 🟥 Net effect | The **$4,440 refund became "$1,746 owed"** — the loud symptom |

And it deliberately **does NOT** nag about Michael's wages rising 11% — that's a normal raise, shown
quietly as blue **"Info."** Knowing what *not* to bother the preparer with is what makes it usable.

---

## Glossary (quick reference)

| Term | Meaning |
|---|---|
| **IRS** | The US tax authority. |
| **Tax return** | The bundle of forms reporting income & tax for one person/year. |
| **Taxpayer / client** | The person the return is for. |
| **Preparer** | The accountant filling it out (our app's user). |
| **Form 1040** | The main individual income-tax form; everything sums up here. |
| **Schedule** | An attachment to the 1040 for a specific situation (business, investments, kids…). |
| **Line** | A numbered field on a form (e.g. "1040 line 1a" = wages). |
| **Deduction** | An amount you subtract from income before tax (lowers your bill). |
| **Standard vs. itemized** | Take a flat deduction, or list real ones on Schedule A — whichever is bigger. |
| **Credit** | A direct reduction of tax owed (e.g. Child Tax Credit). |
| **Withholding** | Tax taken from each paycheck during the year. |
| **Refund / owe** | The reconciliation at year-end: money back, or a bill. |
| **AGI** | Adjusted gross income — income after certain adjustments. |
| **TY** | Tax year (e.g. TY2024 = the 2024 tax year). |
| **MFJ** | "Married filing jointly" — a couple filing one return together. |

---

## Want to connect it to the code?

- The synthetic returns: [`backend/src/data/johnson.2023.json`](../backend/src/data/johnson.2023.json) and `johnson.2024.json`.
- Which lines exist and how they relate: [`backend/src/registry.ts`](../backend/src/registry.ts).
- The diff (detectors): [`backend/src/engine/detect.ts`](../backend/src/engine/detect.ts).
- The scoring + consolidation: [`backend/src/engine/rank.ts`](../backend/src/engine/rank.ts).
- Full technical design: [`SPEC.md`](SPEC.md).
