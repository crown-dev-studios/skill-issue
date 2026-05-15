# Research Rigor Protocol

**Contents**
1. [Why this exists](#why-this-exists)
2. [The five preconditions](#the-five-preconditions)
3. [The two mandatory sections](#the-two-mandatory-sections)
4. [Process checklist (run in order)](#process-checklist-run-in-order)
5. [Anti-pattern: deep insights from shallow queries](#anti-pattern-deep-insights-from-shallow-queries)
6. [Quick reference: semantic markers for re-ingestion](#quick-reference-semantic-markers-for-re-ingestion)

Mandatory for any veneer artifact that presents data findings, research conclusions, audit results, or operational insights. Run this protocol **before** drafting the HTML. If any precondition fails, fix the analysis first; don't paper over it with prettier rendering.

## Why this exists

Data artifacts often fail when presentation polish arrives before analytical discipline. This protocol prevents recurring quality problems:

- Surface-level findings dressed up as insights.
- Percentages without denominators or lookback windows.
- Caveats relabeled at lower severity instead of demoted to footnotes.
- Internal review language in artifacts meant for non-technical audiences.
- Findings stated without baselines or industry comparison.
- Missing "what we could not answer" sections, creating an illusion of comprehensiveness.

The protocol below addresses each of these systematically.

---

## The five preconditions

Do not draft any data finding in a veneer artifact until **all five** are satisfied. If a question can't be answered, that's still a valid answer — capture it in the negative-results section.

### 1. Hypothesis-first

Every finding must trace back to a hypothesis you stated **before** looking at the result. Findings-by-vibes get rejected.

**Required artifacts:**

- A list of hypotheses being tested, written before the data is reviewed.
- For each hypothesis: the test (what query, what comparison), the prediction (what would falsify it), and the result.
- Findings that emerged unexpectedly are valid but must be labeled "exploratory" — a separate cluster from "hypothesis-driven."

**Render in HTML as:**

- A hypothesis appendix or sidebar with the full list, including ones that didn't pan out.
- Each finding card carries a `data-hypothesis="H1"` attribute (or "exploratory") for downstream extraction.

**Bad example:**

> Finding: Renewals are down 8% YoY.

**Good example:**

> Hypothesis (H3): Completion rates differ across customer tenure cohorts.
> Test: 12-month aggregate completion rate, stratified by customer tenure (new / established / long-tenured).
> Result: 5-6 percentage points spread, with new customers underperforming. (Hypothesis supported.)

---

### 2. Baseline-grounded

Every metric needs a baseline. Without a comparison point, a number is decoration.

**Required artifacts:**

- For each finding, a named baseline reference. Acceptable baselines, in preference order:
  1. Industry benchmark (cite the source).
  2. Peer cohort within the same dataset.
  3. Prior period (with explicit window, e.g., "vs. same period 24 months prior").
  4. Theoretical or domain expectation grounded in credible sources.
  5. **"No baseline available"** — stated explicitly, with reasoning for why this is still worth surfacing.

**Render in HTML as:**

- A baseline strip inline with each KPI / finding.
- Citation links to industry sources when available.
- An explicit `<span class="pill pill--neutral">No baseline</span>` when the answer is (5).

**Bad example:**

> 47% of accounts completed onboarding.

**Good example:**

> 47% of accounts completed onboarding — below the 55-60% range reported in the cited benchmark¹. ¹Benchmark source and date.

If no baseline exists, say so:

> 47% of accounts completed onboarding. No published benchmark available; treating this as a descriptive figure, not a performance benchmark.

---

### 3. Denominator-honest

Every percentage states its N and its lookback window. Every rate names the population. No "X% of users" without specifying which users, which event, and what window.

**Required artifacts:**

- `(N=…, window=…)` immediately after every percentage in the source data.
- Denominators must match the artifact's stated lookback (e.g., 3-year report → 3-year denominators).
- Rates over time use the **same** denominator definition across periods.

**Render in HTML as:**

- Numbers always paired with their N in a smaller, muted weight underneath:

```html
<div class="kpi">
  <p class="kpi-value">47%</p>
  <p class="kpi-meta">N = 12,840 accounts · trailing 12 months</p>
  <p class="kpi-label">Accounts that completed onboarding</p>
</div>
```

**Bad example:**

> Reminder open rate: 31%.

**Good example:**

> Message open rate: 31% (N = 4,210 messages sent · trailing 90 days · excluded test sends).

---

### 4. Audience-aware framing

The voice must match the artifact's audience. Executives, customers, operators, and technical readers need different levels of detail and different language.

The reader sees the subject cold; they were not in the room while you analyzed, audited, or re-cut the data. Language that narrates *your preparation process* rather than the finding itself leaks your backstage into their front-row seat. The same word can be right or wrong depending on audience: "audit" is correct in a compliance report written *for auditors* and prep-process leakage in a practice-owner deck. Judge the sentence's purpose, not its tokens. `references/anti-patterns.md` § "Prep-process leakage" carries the full treatment.

**Required artifacts:**

- The artifact declares its audience in the first paragraph or in a sidebar. The declared audience is what decides whether process language is content or leakage.
- Each finding reads as a statement about *the subject*, not about the work that produced it — state the basis ("measured against N=…, window=…"), not the correction event.

**Render in HTML as:**

- An "audience" annotation in the header eyebrow or sidebar.

**Bad example (internal review voice, wrong audience):**

> The audit identified a denominator discrepancy. Recommend correction.

**Good example (stakeholder-facing voice):**

> We sized this against the 12-month window. One thing to flag: the population is accounts with at least one active workflow in that window; inactive accounts were not included.

**Exception:** when the audience genuinely is engineering/internal and the process *is* the subject (a methodology writeup, a post-incident review), process language is the content. The declared audience decides.

---

### 5. Caveat demotion, not severity relabeling

A finding whose interpretation depends on a process anomaly, statistical insignificance, or data-quality caveat does not belong as a "Medium-severity finding." It belongs in a footnote — or, if it's genuinely interesting despite the caveat, in its own clearly-labeled section.

> Wrong: A finding gets demoted from "High" severity to "Medium" because of a caveat. Still presented prominently as a finding.
>
> Right: The finding gets demoted to a footnote (with `<sup>`-style reference from the supporting context) OR moved into a "Context to keep in mind" sidebar. **Not** dressed up as a medium-severity item.

**Render in HTML as:**

- Footnotes (use the footnoted-caveat pattern in `references/design-system.md` § Status idioms).
- A "context to keep in mind" sidebar in the relevant section (not a top-level findings card).
- The `data-caveat="true"` attribute on demoted findings so the markdown extractor surfaces them correctly.

**Bad example:**

> ### Medium finding: Same-day re-presentation rate up 14% YoY
> *Note: This could reflect coding policy changes.*

**Good example:**

> Same-day repeat contact rate is up 14% YoY¹.
>
> ¹ (footnote): This is most likely explained by a tracking-policy change in late 2024. We do not have clean evidence of a real behavior change. Re-cut against pre/post-policy stratification before drawing an operational conclusion.

---

## The two mandatory sections

### Negative results / "What we couldn't answer"

Every data-research veneer artifact ends with a section titled something like "What we couldn't answer" or "Open questions." This prevents the illusion of comprehensiveness.

**Render in HTML as:**

```html
<section class="section" data-section="open-questions">
  <header class="section-header">
    <p class="eyebrow">Section 06</p>
    <h2>Where we couldn't get a clean answer</h2>
  </header>
  <ul class="open-questions">
    <li data-question="customer-tenure-effect">
      <h3>Does customer tenure drive completion rate, or is something else correlated with both?</h3>
      <p>The 12-month window does not give enough cohort separation to isolate tenure from account maturity. Would need a longer lookback or a broader cohort comparison.</p>
    </li>
    <!-- ... -->
  </ul>
</section>
```

This section is required. If you genuinely answered everything in scope, say so explicitly ("we answered all the questions in scope; below are the questions that surfaced as worth chasing next"). Don't omit the section.

### Hypothesis ledger

A sidebar or appendix listing every hypothesis tested (including ones that didn't pan out). This proves the work was hypothesis-driven and not findings-fishing.

```html
<aside class="hypothesis-ledger" data-section="hypotheses">
  <header><p class="eyebrow">Hypotheses tested</p></header>
  <ol>
    <li data-hypothesis="H1" data-result="supported">H1: …</li>
    <li data-hypothesis="H2" data-result="not-supported">H2: …</li>
    <li data-hypothesis="H3" data-result="supported">H3: …</li>
    <li data-hypothesis="H4" data-result="inconclusive">H4: …</li>
  </ol>
</aside>
```

---

## Process checklist (run in order)

Before opening the HTML editor:

1. **Audience declared.** Who is reading this? Note in the header.
2. **Hypotheses listed.** Written down before looking at any chart.
3. **Data queried for each hypothesis.** Cross-reference industry/literature where applicable.
4. **For each finding:**
   - [ ] Hypothesis or "exploratory" tag attached.
   - [ ] Baseline named (or "no baseline" justified).
   - [ ] Denominator and window stated inline.
   - [ ] Caveats demoted to footnotes if they materially change interpretation.
   - [ ] Voice matches audience (no audit-internal language for non-engineers).
5. **Open questions captured.**
6. **Hypothesis ledger built.**
7. **Now you can write HTML.**

If you hit "writing HTML" without all of the above, you're going to produce an artifact the user will reject. Stop and fix the analysis.

---

## Anti-pattern: deep insights from shallow queries

Avoid mistaking shallow analysis for insight. The pattern to avoid:

- Pulling a single aggregate query, observing a number, calling it a finding.
- "8% of accounts have X" with no cross-reference, no segmentation, no relevance check.
- Listing facts about software usage as if they were business insights.

To go from shallow to deep:

- **Segment.** Slice the cohort by account type, tenure, channel, geography, season, or other meaningful dimensions until a number tells you something the aggregate hides.
- **Cross-reference.** Compare to industry, peers, literature, expectations, or a prior period.
- **Hypothesize.** "Why might this be high? What three things could explain it?" Then test each.
- **Trace the implication.** A finding becomes valuable when you can name what action it implies. If you can't, it's a fact, not an insight.

---

## Quick reference: semantic markers for re-ingestion

Veneer HTML uses these `data-*` attributes as **hints** for a future model re-ingesting the artifact (see SKILL.md → "Reverse direction"). They are not parsed by any script — the model reads them as semantic signal when converting back to markdown. Emit them on findings, hypotheses, and caveats so the next reader has unambiguous structure.

| Attribute | Where | Value |
|---|---|---|
| `data-section` | `<section>` | section slug (`findings`, `hypotheses`, `open-questions`, etc.) |
| `data-finding` | finding card | unique finding id |
| `data-hypothesis` | hypothesis item or finding | `H1` / `H2` / `exploratory` |
| `data-result` | hypothesis ledger item | `supported` / `not-supported` / `inconclusive` / `mixed` |
| `data-baseline` | KPI / finding | `industry` / `peer` / `prior-period` / `domain-expectation` / `none` |
| `data-baseline-source` | KPI / finding | citation label |
| `data-denominator` | KPI / finding | `N=12,840 trailing 36mo` |
| `data-caveat` | footnote-referenced finding | `true` |

The markers are convenience, not contract. If a hand-edited artifact has lost them, do your best with the visible structure when extracting.
