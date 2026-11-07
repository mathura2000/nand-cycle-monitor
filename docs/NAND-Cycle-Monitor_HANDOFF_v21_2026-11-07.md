# NAND Cycle Monitor — HANDOFF v21

_Last updated: 2026-11-07 — second session that day_
_Supersedes: HANDOFF v20 (2026-11-07, first session that day) and INGEST_RUNBOOK.md (2026-11-07)_

**This is the single canonical document.** Narrative in Parts 1–9, operating
procedure in Part 10. The separate `INGEST_RUNBOOK.md` is folded in here and
retired — see §4 for why that reverses a v20 decision made the same day.

**Naming convention (v16):** `{ProjectName}_{DocType}_v{N}_{YYYY-MM-DD}.ext`, no
descriptive suffix, supersessions stated with dates. v20 §2 explains what happens
when it isn't applied. Canonical copy lives at `docs/` in the repo; the downloadable
copy carries the same filename.

---

# PART ONE — NARRATIVE

## 1. Full context — what this session was

A Session A run (close out the Q3 2026 ingest) executed on **2026-11-07**, the same
day v20 was written, rather than the Nov 14–17 window v20 scheduled it for. That
mismatch shaped the whole session: the first finding was that the session could not
do what it was scoped to do, and the second was that part of the reason it was
scheduled that way turned out to be wrong.

**Docs loaded at start:** HANDOFF v20 (2026-11-07) and INGEST_RUNBOOK.md, both
supplied by the user. No reconstruction needed this time — the v18 loss documented
in v20 §2 did not recur, and the convention held.

**Prior context carried forward, still current:** Supabase `snmcikbbkbhzcbyrpqtt`,
repo `mathura2000/nand-cycle-monitor`, Vercel deploy, routes in `app/` not
`src/app/`, ingest local-only, two DB triggers owning forecast-history snapshotting
and rolling placeholders, `node_transition_note` immutable since v15, Supabase
keep-alive cron in `athena-love-splash` (settled, do not re-raise).

**Design history is in v20 §3** and is not restated here. Its load-bearing
conclusions, carried forward: inventory is EDGAR-only on actual days (§3.1);
HXSCL capex is real DART YoY, not a tier score, and that revision put four quarters
into supply-led territory (§3.2); the demand index silently drops rows missing
`capex_actual_usd` (§3.3); validation must be per-series, not per-write (§3.4);
EDGAR extraction is duration-based, not frame-based (§3.5); the supply index has a
mathematical ceiling of +47.7 while demand is unbounded, so the gap widens from
growth alone (§3.6); vendor capex is DRAM-contaminated badly enough to invert the
NAND conclusion (§3.7).

---

## 2. The calendar was wrong in both directions

v20 and the runbook assumed SK Hynix (~Nov 14) and Kioxia (~Nov 16) both trailed
the US filers by two weeks, and planned a two-pass Q3 cycle around that pair.

Checked directly this session:

| | v20 estimate | Actual |
|---|---|---|
| SK Hynix Q3 분기보고서 | ~Nov 14 | **not filed as of Nov 7.** DART returns only the 반기보고서 of 2026-08-14. Estimate holds. |
| Kioxia H1 results (tanshin) | ~Nov 16 | **2026-10-30** |
| Kioxia semi-annual securities report | ~Nov 16 | **2026-11-06** |

So Kioxia is not a late filer. Both its artifacts land alongside the US filers, and
the second pass exists for **one ticker**, not two.

This mattered: Kioxia being assumed unavailable is the only reason the Q2 2026 SNDK
capex row sat null, and that null was silently shrinking the vendor average.

---

## 3. What was found

### 3.1 The validation passed, 5 of 5

All five Q2 2026 capex values recomputed from EDGAR with the duration-based rule and
matched the DB exactly: AMZN +68.4% / $54.208B, GOOG +100.1% / $44.924B,
META +82.1% / $30.116B, MSFT +109.6% / $35.802B, MU +166.4%. Both YTD-subtraction
cases and MU's fiscal offset reproduced.

Two procedure errors fell out of doing it rather than trusting it. The source table
described MSFT as a direct single-quarter tag; there is no such record for the June
quarter and it derives by subtraction. The GOOG/META note described the Q3 shape
(9M minus 6M) as if it were general. Both corrected in Part 10.

### 3.2 SanDisk has three capex numbers and they are not the same number

This is the session's most consequential finding and it closes v20's
supersede-or-complement question as a false binary.

| Measure | Q3 2026 | What it is |
|---|---|---|
| PP&E, net (EDGAR) | $54M | SanDisk's own IT and equipment. Not a supply signal. |
| Activity related to Flash Ventures, net | $148M | A **financing** flow to the JV. |
| **Gross capital expenditures** | **$378M** | Economic capital spend incl. SanDisk's share of JV equipment purchases. |

$378M − $54M = $324M, which does **not** equal $148M. Gross capex is therefore a
genuinely distinct third measure, not reconstructible from the other two — which
means neither existing proxy was approximating it well. It is also quarterly,
company-disclosed rather than a partner's, and carries a forward guide
(mid-single-digit percent of FY2027 revenue), which is the only forward-looking
capex signal in the entire tool.

**Flash Ventures turns out to be disclosed, not derived.** SanDisk reports
"Activity related to Flash Ventures, net" directly in the adjusted-FCF
reconciliation of its 8-K Ex.99.1, with prior-year comparative: Q3 2026 −148,
Q2 2026 −110, Q3 2025 **+10**. These reproduce the EDGAR two-tag derivation exactly,
so the derivation becomes a cross-check rather than the method.

**But it cannot go in `capex_pct`.** It is a financing flow that swings negative when
collections exceed lending, as it did through mid-2025. A YoY off a negative base is
undefined. Writing it anyway would be v20 §3.2 in new clothes: a quantity that isn't
a percentage, in the column the composite averages as one. The sign flip from net
collecting to net funding is a real NAND-pure signal and needs a representation that
isn't a percentage.

### 3.3 Kioxia capex is contracting

H1 FY2026 purchase of PP&E = **¥135,296M vs ¥143,127M**, **−5.5% YoY**. The
prior-year base independently reconciles to the H1 figure already used in the FY2025
derivation, which is the cheap two-source validation v20 §6 recommends.

The only pure-play NAND capex series in existence is shrinking year over year while
the blended vendor average reads supply-led. That is v20 §3.7's contamination
argument appearing as data rather than as reasoning.

### 3.4 Adding the NAND-pure vendor pulls the supply index off its ceiling

With SNDK written at −5.5%, the Q3 2026 vendor capex average moves from 155.8 (two
tickers) to 102.0 (three). Through the 60/40 composite by hand: MU and Samsung both
winsorize to +60 and sit at the 45.0 ceiling; SNDK lands at 18.8; the vendor supply
index falls from a pinned **45.0 to roughly 36.3**.

So one NAND-pure vendor relieves the ceiling v20 §3.6 identified and moves the gap
toward demand-led. This is a partial early answer to session B's de-risk question,
and it arrived for free. **It is arithmetic done by hand, not from the app** — treat
it as indicative until the real composite is run.

### 3.5 SanDisk discloses no bit growth and no ASP, in any form

Read the full Q1 FY27 call. The closest thing is the CFO's decomposition: ~60% of a
+23% sequential revenue rise from volume, 40% from pricing. That is total revenue
across data center, edge and consumer, so mix is baked in, and it is not comparable
to MU's NAND-specific +10% / +30%. Both fields stay null; the decomposition is in the
`*_quote` columns.

### 3.6 NBM contracts blunt the sell signal, which is a thesis-level fact

~50% of SanDisk's fiscal 2027 bits and ~two-thirds of fiscal 2028 bits are committed
under New Business Model agreements with fixed and variable components, the variable
portions subject to floors and ceilings, and the committed share is expected to rise.

SanDisk's earnings are therefore materially **less exposed to NAND spot price
declines than the three-signal model assumes**. A downcycle should hit SNDK later and
shallower than it hits unhedged NAND revenue. The supporting evidence is in the
pricing numbers: SanDisk's realised pricing contribution was far below MU (+30%),
SK Hynix (mid-20s%) and Samsung (high-teens%) in the same quarter.

Written as a methodology row. This belongs in the thesis, not the data notes.

### 3.7 The transcripts table stopped being written in May

61 rows, 8 tickers, nothing after **2026-05-10**. Part 10's Mode B says raw text is
the source of truth and is stored before extraction. It hasn't been. The Q3 2026
qualitative fields cite an ~8,000-word SK Hynix call and a ~7,000-word Samsung call
whose text is not in the DB, so those fields cannot be re-extracted if the prompt
changes.

### 3.8 The runbook was never actually in the repo

v20 recorded "Runbook lives in the repo, not the handoff" as a decision made. A clone
of `mathura2000/nand-cycle-monitor` on 2026-11-07 shows top level:
`.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `app`, `eslint.config.mjs`,
`lib`, `next.config.ts`, `package*.json`, `postcss.config.mjs`, `public`, `scripts`,
`tsconfig.json`. No `INGEST_RUNBOOK.md`.

So the separation that v20 reasoned carefully about was never executed, and what
actually existed was two loose files in chat. See §4 for how that was resolved.

---

## 4. Key decisions made

| Decision | Reason |
|---|---|
| SNDK bit growth and ASP stay null, quote stored | §3.5. The column was standardised to NAND-specific QoQ this cycle; a revenue decomposition is a third measurement basis and would undo that. |
| NBM price insulation written as a methodology row | §3.6. It changes how much urgency any sell signal deserves. Thesis-level, not a data note. |
| Flash Ventures representation parked for session B | §3.2. Nothing is lost by parking — the series is deterministically reproducible, and now directly disclosed. Needs a non-percentage representation, which is design work. |
| Kioxia −5.5% applied to both Q2 2026 and Q3 2026, flagged in the note | §3.3. **A null is not neutral**: the supply composite averages over whichever vendors carry a value, so a null moves composite membership underneath the series — the same class as v20 §3.3. Applying the H1 figure asserts only that within-half variation is unobservable, which is true. Consistency over precision. |
| Gross capex adoption deferred pending one unconfirmed base | §3.2. Confirmed back to Dec 2025, so not new, but the Q3 2025 base a YoY needs is unreached. Picking between "supersede outright" and "documented seam" on an assumption would be guessing. |
| Provenance tracking goes in a column, not the consistency check | The check earns its keep because zero rows means clean. A permanently-firing informational category is the cry-wolf failure it was tightened to remove. Schema change, so session B decides and session C builds. |
| Q3 2026 stays `is_forecast = true` | Carried from v20, unchanged. SK Hynix capex still pending. Flipping would create a half-actual quarter. |
| Stopped chasing the gross capex base | North star. It would change one number's YoY, not the direction of any line. |
| **Runbook merged back into the handoff, reversing v20** | §3.8. v20's reasoning (CC and the app can see the repo; procedure changes rarely while narrative churns) was sound *conditional on the runbook actually being in the repo*. It never was, so the real state was two loose chat files and the fragmentation the split was meant to prevent. One canonical doc, committed to `docs/`, is the simpler thing that is actually true. **Consequence accepted:** the procedure now gets re-versioned whenever the narrative does. Mitigation: `docs/` holds the dated file and the repo's `CLAUDE.md` should name the current one so CC never has to guess. |
| Session B prompt restructured and split rather than extended | §9. It went from 5 items to 10 when this session's findings were added, which makes worse the exact overload v20 §10 warned about. Smoothing, normalization and lag moved out; see §9. |

---

## 5. What was achieved

**Written and verified** (every write followed by a separate SELECT):
- SNDK Q3 2026: `bit_growth_quote`, `asp_quote`, `extraction_notes`; both numeric
  fields deliberately left null
- SNDK Q2 2026 and Q3 2026: `capex_pct = -5.5`, `capex_quote`, extraction notes
  appended with the H1-derived flag
- 4 new methodology rows (table 27 → **31**): NBM price insulation; Flash Ventures
  as a disclosed line with the never-write-to-capex_pct caution; gross capex as a
  third distinct measure with its open base; the Kioxia H1-to-two-quarters convention
- Consistency check re-run after all writes: **zero rows**

**Validated:**
- All five Q2 2026 capex values reproduced from scratch
- Kioxia H1 FY2025 base reconciled against the figure already in use
- Flash Ventures EDGAR derivation reconciled against SanDisk's own disclosed line,
  three quarters including the prior-year comparative

**Artifacts:** this document, which absorbs and retires `INGEST_RUNBOOK.md`.

**Access notes:** `data.sec.gov`, `www.sec.gov` and `dart.fss.or.kr` are all
reachable **from the shell** with a conforming User-Agent (`Name email@domain`),
which is faster than web fetch for EDGAR work and allows scripted extraction.
`kioxia-holdings.com` is not on the allowed-domains list but was reachable via web
fetch. `fool.com` and `benzinga.com` are reachable by neither route, and one open
item needs them (§7).

---

## 6. Lessons learned

**Check the calendar before planning around it.** Two passes were planned for two
late filers. One of them wasn't late. The estimate had been carried forward across
sessions without anyone checking the filer's actual schedule, and it cost a null in
the composite for a quarter.

**A decision recorded as made is not a decision executed.** §3.8. v20 reasoned
carefully about where the runbook should live, wrote the conclusion down, and the
file never reached the repo. Nothing in the process checks that. Where a decision has
a physical artifact, verify the artifact exists before the next session builds on it.

**A null is not neutral, and this is now the third instance of one pattern.** v17 had
nulls rendering as zero in Recharts. v20 §3.3 had the demand index silently averaging
over three tickers instead of four. This session had a vendor average running on two
instead of four. Same class every time: *absent data silently becoming a plausible
number.* v20's lesson said to ask what class a defect belongs to. The class is now
named and a structural fix is on session B's list rather than being patched locally a
fourth time.

**Read the reconciliation table before building a derivation.** The Flash Ventures
figure was being derived from two XBRL tags when SanDisk prints it as a labelled line
with its prior-year comparative in every 8-K. The derivation was correct, which is
what kept it from being noticed.

**When arithmetic doesn't close, that's the finding.** $378M − $54M ≠ $148M looked
like a reconciliation failure and was actually the discovery that there are three
distinct measures. The instinct to force the numbers to agree would have buried it.

**Distinguish unreached from unavailable.** The Q3 2025 gross capex base is not
confirmed absent. It is behind a domain that isn't on the allowlist. Recording it as
"not disclosed" would have become permanent false precedent, exactly as the Kioxia
calendar estimate did.

**Precision has a stopping point.** The north star is direction and shape, not
absolute numbers. The gross capex base would refine one YoY; it would not move a
line.

---

## 7. Next steps

| Priority | Item | Notes |
|---|---|---|
| HIGH | **After ~Nov 14: SK Hynix Q3 2026 capex from DART** | The only thing still blocking Q3 close-out. Q3 = 9M 2026 cumulative minus H1 2026 of KRW 18,328,836M; prior-year base Q3 2025 = KRW 5,032,611M. Procedure in §10.3. |
| HIGH | **Then flip Q3 2026 to actual** | All 8 tickers together, null `forecast_confidence`, let the trigger create Q1 2027 placeholders. Run the consistency check after. |
| HIGH | **Commit this doc to the repo and point `CLAUDE.md` at it** | §3.8. Not done — pushes from the chat session are refused; see §11. |
| HIGH | **Resolve the gross capex Q3 2025 base** | One fetch once `fool.com` or `benzinga.com` is allowlisted, or from the Q1 FY26 deck on investor.sandisk.com. Decides supersede-outright vs documented-seam. |
| HIGH | **Supply-index redesign session** (v20 §3.6, §3.7) | Scope in §9. |
| MED | Backfill the `transcripts` table | §3.7. Q2 and Q3 2026 for all 8 tickers where still reachable. |
| MED | Promote Kioxia to a first-class ticker | Carried from v20. Now more attractive: the −5.5% reading is the cleanest contamination calibration available. |
| MED | Samsung DS division capex instead of total company | Carried from v20. DS was KRW 27.2T of 29.0T in Q3. |
| MED | Capacity events table | Carried from v20. Seed list in v20 §8. |
| MED | Solidigm ₩60T disclosure needs a home | Carried from v20. |
| LOW | SNDK `bit_growth_pct` Q1 2026 = 18 | Quote suggests YoY while the column is QoQ. Carried from v20. |
| LOW | Stale comment at `app/api/sheets/route.ts` line ~66 | Says "80% node + 20% capex"; code does 60/40. Carried from v20. |
| LOW | `fill-capex.ts` does not flip `is_forecast` | One-line fix. Carried from v17. |

---

## 8. Open questions

Carried from v20, still open:

- **Is the TrendForce pricing series forecasts rather than actuals?** Unresolved. No
  pricing written this session either. Still blocks the 60/40 backtest.
- **Does MU deserve the scrutiny that removed SK Hynix as an inventory signal?** MU's
  inventory is DRAM-heavy, same contamination argument.
- **Is comparing two growth rates off very different bases sound at all?**
- **What is the right band-to-number convention?** Midpoint is in use but was chosen,
  not derived.
- **Does the forecast-accuracy backtest become a dashboard feature or a manual query?**

New this session:

- **How should a financing flow that changes sign be represented in a supply signal?**
  Flash Ventures net activity is NAND-pure and its sign flip is real, but it cannot be
  a YoY percentage. Trailing sum, absolute dollars on a second axis, or a state flag?
- **Does gross capex supersede Kioxia outright, or carry a documented seam?** Hinges
  on the unconfirmed Q3 2025 base.
- **Should the composite average over variable membership at all?** Three instances of
  the same defect say no. What replaces it is a design question.

---

## 9. Session prompts

### Session A-remainder — close out Q3 2026 (chat, after ~Nov 14)

```
NAND cycle monitor — personal tool to signal when to reduce SanDisk (SNDK) exposure.

Load NAND-Cycle-Monitor_HANDOFF_v21_2026-11-07.md. It is the only doc — procedure
is Part 10 of it. Supabase MCP: snmcikbbkbhzcbyrpqtt
Allowed domains: data.sec.gov, www.sec.gov, dart.fss.or.kr
(www.sec.gov 403s non-conforming User-Agents; use "Name email@domain".
 The shell reaches all three directly — scripted extraction beats web fetch.)

Everything in the Q3 2026 ingest is done except SK Hynix. Short session.

1. Consistency check (§10.6) first. Expect zero rows.
2. SK Hynix Q3 2026 capex from DART (§10.3). Confirm the 분기보고서 is filed before
   anything else — as of Nov 7 it was not. Derivation is in the HXSCL Q3 2026 row's
   extraction_notes: Q3 = 9M 2026 cumulative minus H1 2026 of KRW 18,328,836M;
   prior-year base Q3 2025 = KRW 5,032,611M.
3. Validate by recomputing Q2 2026 from scratch first (§10.5).
4. Then flip all 8 Q3 2026 rows to is_forecast=false together, null
   forecast_confidence, let the trigger create Q1 2027 placeholders.
5. Re-run the consistency check. Update the §10.4 calendar with the actual
   SK Hynix filing date.

Do not write TrendForce pricing — the forecast-vs-actual question is open (§8).
Do not write Flash Ventures to capex_pct — see §10.2.
Propose diffs before writing. SELECT after every UPDATE in a separate call.
```

### Session B — signal redesign, analysis and decisions only (chat)

Restructured from v20. Adding this session's findings took it from five items to ten,
which makes worse the overload v20 §10 warned about, so smoothing, normalization and
lag are deferred — there is no point tuning how a series reads when its inputs are
about to change. The de-risk step is also partly answered already, so it is shorter.
And the contamination thread turned out to be entangled with the ceiling thread
(§3.4), so those cannot be sequenced independently the way v20 assumed.

```
NAND cycle monitor — signal design session, not an ingest.

Load NAND-Cycle-Monitor_HANDOFF_v21_2026-11-07.md first, then v20 for the design
history (v20 §3.6 and §3.7 especially; v21 carries the conclusions, not the
derivations). Supabase MCP: snmcikbbkbhzcbyrpqtt
Allowed domains: data.sec.gov, www.sec.gov, dart.fss.or.kr — all three reachable
from the shell with User-Agent "Name email@domain". fool.com and benzinga.com are
NOT reachable and one open item needs them (see 5).

Context in one line: the supply index has a mathematical ceiling of +47.7 while
demand is unbounded, the gap widens mechanically under any sustained growth even
when supply and demand grow identically, and vendor capex is DRAM-contaminated
badly enough to invert the NAND conclusion.

North star: this tool shows where the cycle is heading. Shape and direction of the
lines matter; absolute numbers and percentages do not. Do not chase accuracy that
doesn't move a line.

DE-RISK FIRST — mostly already done, so this should be short.
The question was whether a NAND-specific view tells a different story than the
capex gap. Evidence in hand (v21 §3.3, §3.4): Kioxia capex, the only pure-play NAND
series, is -5.5% YoY while the blended vendor average reads supply-led; and writing
SNDK at -5.5% dropped the Q3 2026 vendor supply index from a pinned 45.0 to ~36.3.

Step one: verify that 36.3 against the real composite in app/api/sheets/route.ts.
It is hand arithmetic. If it does not reproduce, stop and find out why first.

Kill condition unchanged: if the NAND-specific view tells the same story as the
capex gap, contamination doesn't matter and items 2 and 5 drop.

Then, in order of leverage:

1. SHOULD THE COMPOSITE AVERAGE OVER VARIABLE MEMBERSHIP AT ALL?
   Three instances of one defect: v17 nulls rendering as zero in Recharts, v20 §3.3
   the demand index averaging three tickers instead of four, v21 §3.4 the vendor
   average running on two instead of four. Each patched locally. The class is
   "absent data silently becoming a plausible number." A fourth local patch is the
   wrong move. This is a correctness bug, not a design preference, and it sits
   underneath everything else here.

2. NAND-share weighting of vendor capex (backlog #14, deferred since v14). SEMI's
   2027 split is 3D NAND $16.8B vs DRAM $25.2B, roughly 40/60 within memory.

3. Replace the 1-5 node ordinal with a layer-count / generation index. Public,
   NAND-specific, monotonic, no ceiling. Note this removes only half the ceiling —
   the capex leg still winsorizes at ±60, and both tickers pinning the index today
   are pinned on the capex leg, not the node leg.

4. How to represent Flash Ventures net activity (v21 §3.2). NAND-pure, quarterly,
   directly disclosed in the 8-K adjusted-FCF reconciliation with prior-year
   comparative. But it is a financing flow that changes sign (Q3 2025 +10,
   Q3 2026 -148), so a YoY percentage is undefined. Trailing sum? Absolute dollars
   on a second axis? A state flag for the net-collecting to net-funding flip?
   It must NOT go in capex_pct.

5. Does gross capex replace the SNDK capex proxy entirely (v21 §3.2)? Quarterly,
   company-disclosed, NAND-inclusive, forward-guided — beats both current proxies.
   Blocked only on the unconfirmed Q3 2025 base.

6. A `provenance` column on signals (edgar / h1_derived / band_midpoint /
   disclosed_nongaap). §10.8b explains why this can't live in the consistency
   check. Decide here; session C builds it. Falls out of item 1 — a composite that
   weights or excludes by sourcing quality needs this to exist.

7. Does NBM price insulation belong in the signal, not just the thesis (v21 §3.6)?
   ~50% of FY2027 SNDK bits and ~two-thirds of FY2028 are price-hedged with floors
   and ceilings, and the committed share is rising. If NAND pricing maps to SNDK
   earnings with that much damping, the sell signal's threshold should arguably
   move. This is the one item that changes what the tool is for rather than how it
   computes — it may deserve its own conversation.

DEFERRED to a later session, deliberately: smoothing (2-4 quarters), normalization
against a frozen window, and lag handling. All three tune how a series reads, and
the series is about to change underneath them. v20 §7 holds the gathered evidence.
Normalization is the judgment-heavy, closer-to-open-research item; keeping it off
the critical path is the point of deferring it.

Expect item 1 to expand once pulled on. If it consumes the session, items 4-7 slide
and that is the right outcome, not a failure.

Analysis and decisions ONLY. Do NOT change application code. End by writing the
agreed decisions to the methodology table so the CC spec can cite them rather than
re-deriving them. Discuss before deciding.
```

### Session C — implementation (Claude Code, after B)

```
Read docs/NAND-Cycle-Monitor_HANDOFF_v21_2026-11-07.md fully before anything —
it is the only doc, procedure included (Part 10). Then read the methodology table
rows written by the session B design pass. They are the spec: cite them, do not
re-derive them.

- Repo: github.com/mathura2000/nand-cycle-monitor
- Supabase: snmcikbbkbhzcbyrpqtt.supabase.co
- Routes in ./app/ not ./src/app/
- Do NOT touch app/layout.tsx or app/globals.css
- Do NOT re-extract node_transition_note (immutable since v15)
- Two DB triggers own forecast-history and rolling placeholders — do not
  reintroduce app-level equivalents
- Config notes use <b> HTML; extractBullets()/renderBulletText(), not parseBold()
- Do NOT add band keys to DISPLAY_KEYS in ChartTooltip
- Chart changes MUST be verified against the real production component with
  mocked fetch and real SVG path inspection, NOT a scratch page. v17 §7 explains
  why: a scratch page with transcribed logic validated the wrong thing and cost
  two extra rounds.
- Show diff before any change >10 lines

Known cleanups to fold in while touching these files:
- app/api/sheets/route.ts line ~66 comment says "80% node + 20% capex"; the code
  does 60/40. Fix the comment.
- scripts/fill-capex.ts does not flip is_forecast when filling a placeholder's
  capex_actual_usd. One-line fix, carried from v17.

Today's goal: [STATE GOAL]
```

---

# PART TWO — OPERATING PROCEDURE

_Absorbed from `INGEST_RUNBOOK.md` (2026-11-07), which is retired. This is the
quarterly ingest procedure. It changes rarely; Part One changes every session._

## 10.0 Before you start

Run the consistency check (§10.6). It should return zero rows. If it doesn't, fix
that before adding new data, because every defect found on 2026-11-07 was invisible
at write time and only visible looking down a column.

---

## 10.1 Source table — where every number comes from

### EDGAR XBRL (authoritative for all US-filer financials)

Endpoint: `https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{tag}.json`
Requires a `User-Agent` header. `data.sec.gov` and `www.sec.gov` must both be on the
session's allowed-domains list (claude.ai → Settings → Capabilities). `www.sec.gov`
additionally rejects non-conforming User-Agents with HTTP 403; use the form
`Name email@domain`. **Both are reachable from the shell**, so prefer `curl` plus a
script over web fetch for anything involving more than one ticker.

| Ticker | CIK | Capex concept | Derivation |
|---|---|---|---|
| AMZN | 0001018724 | `PaymentsToAcquireProductiveAssets` | direct single-quarter tag |
| GOOG | 0001652044 | `PaymentsToAcquirePropertyPlantAndEquipment` | **cumulative subtraction** (no single-quarter tag); calendar Q2 = 6M minus 3M, Q3 = 9M minus 6M |
| META | 0001326801 | `PaymentsToAcquirePropertyPlantAndEquipment` | **cumulative subtraction**, same shape as GOOG |
| MSFT | 0000789019 | `PaymentsToAcquirePropertyPlantAndEquipment` | **cumulative subtraction, not a direct tag** — no single-quarter record exists for the June quarter, so calendar Q2 = FY total minus 9M. FY ends 30 Jun, so MSFT fiscal Q1 = calendar Q3 |
| MU | 0000723125 | `PaymentsToAcquirePropertyPlantAndEquipment` | FY ends ~early Sep; **FQ4 = FY total minus 9M** |
| SNDK | 0002023554 | `InventoryNet`, `CostOfGoodsAndServicesSold`, `PaymentsToAcquireNotesReceivable`, `ProceedsFromCollectionOfNotesReceivable` | see §10.2 and §10.3 |

### Fiscal-to-calendar quarter mapping (do not re-derive)

- **MU** quarter-end month → app quarter: Feb→Q1, May→Q2, Aug/Sep→Q3, Nov→Q4. Year = calendar year of the quarter-end.
- **SNDK** quarter-end month → app quarter: Mar/Apr→Q1, Jun/Jul→Q2, Oct→Q3, **Jan→Q4 of the _previous_ year**.
- **MSFT** fiscal Q1 = calendar Q3, fiscal Q4 = calendar Q2.
- **Kioxia** FY runs Apr→Mar. FY Q1 = calendar Q2, Q2 = calendar Q3, Q3 = calendar Q4, Q4 = calendar Q1.

### Non-EDGAR sources

| Ticker | Source | Notes |
|---|---|---|
| SSNLF | `news.samsung.com` quarterly results release | Total-company capex. DS division capex also disclosed and is the less contaminated figure. |
| HXSCL | **DART** (`dart.fss.or.kr`) — see §10.3 | Quarterly capex is NOT in any SEC filing. |
| SNDK capex | See §10.2 — three distinct measures | |
| TrendForce | `trendforce.com/presscenter/` press releases | Primary release only. A prior cycle's figure sourced from a search snippet was pulled for it. |

---

## 10.2 Derivation rules

### Duration-based extraction (REPLACES v18's frame-only rule)

v18's lesson said "only records with `frame` matching `CY20##Q#` are safe." That rule
is **wrong in practice**: SEC assigns frames lazily, and on 2026-11-07 GOOG, META and
MU had no Q3 2026 frame despite their 10-Qs being filed and public. Following it
literally would have reported three of five tickers as unreported.

Use instead: select entries whose `end - start` falls between 80 and 100 days (a
single quarter), dedupe by `(start, end)` keeping the **earliest-filed** record, and
where no single-quarter record exists, derive by cumulative subtraction from the YTD
series. Deterministic, and it reproduces every previously accepted value.

### inventory_days

```
inventory_days = InventoryNet(at quarter end) / quarterly COGS * actual days in period
```

EDGAR only. Actual days, not a fixed 90. Period-length-neutral by construction: a
98-day quarter carries proportionally more COGS, and the longer divisor cancels it.
Applies to MU and SNDK only. SK Hynix is formally rejected as an inventory signal
(DRAM-dominant, revenue-based denominator).

Before 2026-11-07 this series was stitched from mixed sources and did not reconcile
to EDGAR (MU Q2 2025 was 158 in the DB against 136 on EDGAR). The whole series was
recomputed on this single basis. Do not reintroduce transcript-sourced inventory.

### SNDK capex — three distinct measures, do not conflate

SanDisk has three capex-ish numbers and they measure different things. Mixing them is
the tier-score-in-a-percentage-column failure waiting to happen.

| Measure | Q3 2026 | What it is | Use |
|---|---|---|---|
| PP&E, net (EDGAR `PaymentsToAcquirePropertyPlantAndEquipment`) | $54M | SanDisk's own IT and equipment | **not** a supply signal |
| Activity related to Flash Ventures, net | $148M | *financing* flow to the JV | see caution |
| **Gross capital expenditures** | **$378M** | economic capital spend incl. SanDisk's share of JV equipment purchases | best NAND supply measure available |

**Flash Ventures is a disclosed line, not a derivation.** SanDisk reports "Activity
related to Flash Ventures, net" directly in the adjusted free cash flow
reconciliation of its quarterly 8-K Ex.99.1, with the prior-year comparative
alongside (Q3 2026 −148, Q2 2026 −110, Q3 2025 **+10**). Read it there. It reproduces
the old two-tag EDGAR derivation (`PaymentsToAcquireNotesReceivable` −
`ProceedsFromCollectionOfNotesReceivable`) exactly, so keep that only as a
cross-check.

**Caution:** it is a financing flow, not capital spend. It swings negative when
collections exceed lending, as it did through mid-2025, so a YoY percentage off a
negative base is undefined. **Never write it to `capex_pct`.** Representation is
deferred to the signal redesign session.

**Gross capex** is disclosed in prepared remarks only, never in the press release
(verified against the Q1 FY26 8-K). Confirmed history: Q4 2025 $525M (8.4% of
revenue), Q2 2026 $562M (6.3%), Q3 2026 $378M (3.4%). Forward guide mid-single-digit
percent of revenue for FY2027. Note $378M − $54M = $324M ≠ $148M, so gross capex is
genuinely a third measure and is not reconstructible from the other two — which means
neither older proxy was approximating it well.

**OPEN:** the Q3 2025 gross capex base needed for a YoY is unconfirmed. The Nov 2025
call is on transcript hosts not currently on the allowed-domains list. Not confirmed
absent, only unreached — adding `fool.com` or `benzinga.com` settles it in one fetch.

### SNDK capex — Kioxia proxy (legacy)

Kioxia discloses capex **only** semiannually and annually, never quarterly, not even
in the annual report. Confirmed by direct read of the FY2025 annual securities
report, and reconfirmed 2026-11-07 against the FY2026 semi-annual securities report.
Derivation by cumulative subtraction is permanent, not a stopgap. **Do not spend
session time looking for a Kioxia quarterly capex table — it structurally does not
exist.**

**H1-to-two-quarters convention (settled 2026-11-07).** Kioxia FY runs Apr–Mar, so an
H1 figure spans two calendar quarters and cannot be split. Apply the H1 YoY to both.
H1 FY2026 = ¥135,296M vs ¥143,127M = **−5.5%**, written to SNDK Q2 2026 and Q3 2026.

The reasoning matters more than the number: **a null is not neutral.** The supply
composite averages over whichever vendors carry a value, so leaving SNDK null moves
the composite's membership underneath the series — the same class of defect as the
demand index dropping rows. Applying the H1 figure asserts only that within-half
variation is unobservable, which is true, and the note says so. Consistency over
precision, per the north star.

---

## 10.3 SK Hynix via DART — step by step

SK Hynix listed in the US on 2026-07-09 (ticker SKHY, CIK 0002120882) but files
**6-K only** (event notices: treasury shares, rumour clarifications) plus an annual
20-F. Its `companyfacts` carries only fee-disclosure tags — **no XBRL financials**.
SEC is not a source for SK Hynix quarterly capex. DART is.

Requires `dart.fss.or.kr` on the allowed-domains list. Reachable from the shell.

1. **Find the filing.** POST to `https://dart.fss.or.kr/dsab007/detailSearch.ax`
   with form fields `textCrpNm=SK하이닉스`, `startDate`, `endDate`, `maxResults`, and
   `publicType=A001&publicType=A002&publicType=A003` (periodic reports). Set a
   `Referer` of `https://dart.fss.or.kr/dsab007/main.do`. Parse `rcpNo=(\d{14})` from
   the response. The rcpNo's first 8 digits are the filing date.
2. **Find the cash flow section.** GET
   `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcpNo}`. The page embeds a JS tree;
   each node sets `node N['text']`, `rcpNo`, `dcmNo`, `eleId`, `offset`, `length`,
   `dtd`. Find the node whose text contains both `연결` and `현금흐름표`.
3. **Fetch it.** GET `https://dart.fss.or.kr/report/viewer.do` with that node's
   `rcpNo`, `dcmNo`, `eleId`, `offset`, `length`, `dtd` as query params, and a
   `Referer` of the main.do URL.
4. **Extract.** The line item is `유형자산의 취득`. Units are 백만원 (KRW millions).
   Values are cumulative year-to-date and parenthesised as negative. Each filing also
   carries the **prior-year comparative column**, which is how the 2023 and 2024
   history was recovered.
5. **Derive quarterly** by cumulative subtraction within the calendar year
   (SK Hynix FY = calendar year).

**Filing schedule** (confirmed from history): Q1 분기보고서 ~May 15, 반기보고서
~Aug 14, Q3 분기보고서 **~Nov 14**, 사업보고서 ~Mar 17. The Q3 report lands about two
weeks after the earnings call, so **the Q3 ingest cannot close on the main batch
date.** Verified 2026-11-07: as of that date only the Aug 14 반기보고서 was present.

Validation anchor: derived Q2 2026 = KRW 10,671,433M, independently matching the
KRW 10.67T figure found via press coverage in the 2026-08-09 session.

---

## 10.4 Recurring ingest calendar

| Source | Original estimate | **Actual** | Artifact |
|---|---|---|---|
| MU earnings | ~Sep 24 | **Sep 30** | 10-K filed Oct 9 |
| META | ~Oct 30 | **Oct 21** | 10-Q Oct 22 |
| GOOG | ~Oct 22 | **Oct 28** | 10-Q Oct 29 |
| MSFT | ~Oct 28 | **Oct 28** | 10-Q Oct 28 |
| HXSCL earnings | ~Oct 27 | **Oct 28** | DART report ~Nov 14 |
| SSNLF | ~Oct 29 | **Oct 29** | results release |
| AMZN | ~Oct 31 | **Oct 29** | 10-Q Oct 30 |
| SNDK | ~Nov 5 | **Oct 29** | 10-Q Oct 30 |
| Kioxia results (tanshin) | ~Nov 16 | **Oct 30** | H1 FY2026 consolidated results |
| Kioxia semi-annual securities report | ~Nov 16 | **Nov 6** | full cash flow statement |
| SK Hynix 분기보고서 | ~Nov 14 | **pending as of Nov 7** | |

**Practical consequence (revised 2026-11-07).** Kioxia is NOT a late filer — the
~Nov 16 estimate was wrong by about two weeks. Both Kioxia artifacts land in the same
window as the US filers. **SK Hynix alone trails**, on its own ~Nov 14 schedule, so
the second pass exists for one ticker.

Plan the Q3 cycle as: **main batch ~Nov 1 covering everything except SK Hynix**
(US filers, Samsung, Kioxia), then a short **SK Hynix-only pass after ~Nov 14**,
which is also when Q3 can flip to actual.

---

## 10.5 Validation step (mandatory, costs one query)

Before trusting any new quarter's numbers, **recompute the _prior_ quarter from
scratch and confirm it reproduces what's already in the DB.** Done twice on
2026-11-07; both times it reproduced all five Q2 2026 capex values exactly, including
both YTD-subtraction cases and MU's fiscal offset.

A synthetic test does not substitute. The test case must be a real prior quarter.

---

## 10.6 Series consistency check — run before close-out

Zero rows = clean. Structurally-expected gaps are suppressed so that any output means
act.

```sql
WITH q AS (SELECT *, quarter_sort_key(quarter) AS k FROM signals)
SELECT * FROM (
  -- A. ACTUAL hyperscaler row missing capex_actual_usd -> silently dropped from the P1
  --    demand index, which averages over surviving rows and yields a plausible wrong number.
  --    Forecast rows exempt: computeForecastDemandIndex derives USD from prior-year x capex_pct.
  SELECT 'A. demand index drops this row' AS issue, ticker, quarter,
         'capex_pct='||capex_pct||' but capex_actual_usd null' AS detail
  FROM q WHERE type='hyperscaler' AND is_forecast IS NOT TRUE
    AND capex_pct IS NOT NULL AND capex_actual_usd IS NULL
  UNION ALL
  -- A2. forecast demand needs the prior-year same quarter actual USD present
  SELECT 'A2. forecast demand has no prior-year base', f.ticker, f.quarter,
         'no capex_actual_usd at '||quarter_add(f.quarter,-4)
  FROM q f WHERE f.type='hyperscaler' AND f.is_forecast IS TRUE AND f.capex_pct IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM q p WHERE p.ticker=f.ticker
                    AND p.quarter=quarter_add(f.quarter,-4) AND p.capex_actual_usd IS NOT NULL)
  UNION ALL
  -- B. trigger's placeholder note still attached to a row that now holds a real value
  SELECT 'B. stale placeholder note', ticker, quarter, 'notes say pending but capex_pct='||capex_pct
  FROM q WHERE extraction_notes ILIKE '%pending guidance%' AND capex_pct IS NOT NULL
  UNION ALL
  -- C. actual row whose provenance stamp predates the quarter it describes
  SELECT 'C. extracted_at predates its quarter', ticker, quarter,
         'stamped '||to_char(extracted_at,'YYYY-MM-DD')
  FROM q WHERE is_forecast IS NOT TRUE AND extracted_at IS NOT NULL
    AND extracted_at < make_date((split_part(quarter,' ',2))::int,
                                 (substr(split_part(quarter,' ',1),2,1))::int*3, 1)
  UNION ALL
  -- D. vendor actual with no capex. SNDK exempt: structurally semiannual.
  SELECT 'D. vendor actual with no capex', ticker, quarter, 'capex_pct null'
  FROM q WHERE type='vendor' AND is_forecast IS NOT TRUE AND capex_pct IS NULL AND ticker <> 'SNDK'
  UNION ALL
  -- E. inventory gap for the two tickers carrying the inventory tier
  SELECT 'E. inventory gap', ticker, quarter, 'inventory_days null'
  FROM q WHERE ticker IN ('MU','SNDK') AND is_forecast IS NOT TRUE AND inventory_days IS NULL
) z ORDER BY issue, quarter, ticker;
```

Validate the check itself with a negative control: re-introduce a known defect in a
CTE (not a write) and confirm the relevant rule fires. An empty result from an
unvalidated check proves nothing.

---

## 10.7 Write procedure

1. SELECT existing rows first.
2. Propose the diff in chat and get explicit confirmation (standing preference).
3. Execute via Supabase MCP `execute_sql`; `apply_migration` for schema only.
4. **SELECT again in a separate call** to confirm the write landed. An UPDATE can
   appear to succeed while the DB retains the old value.
5. Batch multi-row updates into one statement. Each write to an `is_forecast=true`
   row fires a `forecast_history` snapshot, so fewer statements means less noise.
6. Set `extracted_at` on every write. It was silently frozen at the forecast seeding
   date until 2026-11-07.
7. `quarter` sorts incorrectly lexicographically. Always use `quarter_sort_key()`.

**Do not** manually insert into `forecast_history` or create placeholder rows. Two DB
triggers own that for every write path. If you find yourself writing that logic by
hand, the trigger isn't firing and that's a bug to flag.

**Never re-extract `node_transition_note`.** Manually rewritten in v15, immutable.

**Store the raw transcript before extracting from it.** Mode B (§10.9) says raw text
is the source of truth, but the `transcripts` table has not been written since
2026-05-10 — 61 rows, nothing for Q2 or Q3 2026. The Q3 2026 qualitative fields cite
an ~8,000-word SK Hynix call and a ~7,000-word Samsung call whose text is not in the
DB, so those fields cannot be re-extracted if the prompt changes. Backfill where the
transcripts are still reachable, and insert raw text as step 1 of any Mode B pass.

---

## 10.8 Known structurally unavailable — do not chase

- Kioxia quarterly capex (semiannual/annual only, permanent)
- SK Hynix quarterly capex from SEC (6-K only, no XBRL financials)
- SEC `frame` values for GOOG and META single quarters
- SNDK NAND bit shipment and ASP figures — **in any form**, not just the results
  release. Confirmed 2026-11-07 by reading the full Q1 FY27 call. The closest thing
  is a volume/price decomposition of total revenue (~60% volume / 40% price of a
  +23% sequential rise), which bakes in mix across data center, edge and consumer and
  is therefore NOT comparable to MU's NAND-specific figures. Both fields stay null;
  the decomposition lives in the `*_quote` columns.
- TrendForce retrospective actual prices (they publish forward forecasts at quarter
  start, not realized prints — see §8 open questions)

### 10.8b Provenance is not tracked, and the check can't carry it

Rows now carry three sourcing qualities — EDGAR-exact,
H1-derived-applied-to-two-quarters, and band-midpoint — with nothing but free text in
`extraction_notes` distinguishing them.

This does **not** belong in §10.6. That check earns its keep because zero rows means
clean and any output means act; adding a permanently-firing informational category is
the cry-wolf failure it was tightened to remove.

The fix is a `provenance` column on `signals` (`edgar`, `h1_derived`,
`band_midpoint`, `disclosed_nongaap`), queried separately. That is a schema change and
it needs the redesign session's input first, since a composite that weights or
excludes by sourcing quality would consume it.

---

## 10.9 Ingest modes

**Mode A — EDGAR XBRL.** Structured financial data, no AI. All capex for MU and the
hyperscalers. Runs against the source table in §10.1 with the duration-based rule in
§10.2.

**Mode B — earnings call transcripts.** Qualitative signals only: node transition
score and management tone. Raw transcript is stored in the `transcripts` table
**before** extraction (see §10.7 — this has not been happening). The source of truth
is always the raw text, not the extracted values.

The governing principle: **if a number appears in a financial statement, it comes
from EDGAR, not from AI extraction.** Mixed sourcing creates methodology
inconsistency that silently corrupts signal direction.

Ingest runs **locally only** (localhost:3001). Vercel serverless IPs are blocked by
the transcript providers. This is a platform-level block, not a rate limit.

---

## 10.10 Qualitative band convention (NEEDS A DECISION)

Samsung and SK Hynix report bit growth as bands ("mid-single-digit", "high-teens",
"mid-20% range"), not figures. Midpoint conversion is in use but was chosen rather
than derived, and it is not recorded as a methodology row. Agree a mapping, record
it, and reference it here. Until then, store the band text in the `*_quote` column
and leave the numeric field null rather than guessing.

---

## 11. Repo status

This document belongs at `docs/NAND-Cycle-Monitor_HANDOFF_v21_2026-11-07.md`.

As of 2026-11-07 it has **not** been pushed. The chat session has repo read access
but pushes are refused: Claude lacks GitHub write access for this account. Fix by
installing the Claude GitHub App at
`https://github.com/apps/claude/installations/select_target`, or reconnecting GitHub
from claude.ai settings. Until then the downloaded copy is canonical.

When it does land, update the repo's `CLAUDE.md` to name the current handoff file, so
Claude Code never has to guess which dated doc is live. That pointer is what makes a
versioned filename safe for a document that also holds procedure.
