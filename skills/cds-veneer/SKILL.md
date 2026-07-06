---
name: cds-veneer
description: 'Builds polished single-file HTML artifacts (reports, decks, formal code reviews, audits, specs, explainers) from markdown, data, or analysis using an editorial newsprint design system. INVOKE ONLY ON EXPLICIT REQUEST that names veneer or asks for a shareable single-file HTML artifact — e.g. "/veneer", "veneer this", "make a shareable HTML report/deck/code review/audit", "single-file HTML artifact for X", "broadside/folio/dispatch this". Also does the reverse — reads veneer HTML and extracts clean markdown for model re-ingestion. Do NOT trigger on a generic "make an HTML page", app or product UI, dashboards inside a running app, web scraping, or marketing/landing pages — those route to frontend-design, firecrawl, or other skills.'
---

# Veneer

Single-file HTML artifacts with an editorial newsprint feel. The point is to take dense information — a research finding, a planning doc, a formal code review, a deck — and make it readable, defensible, and shareable as one file you can drop on S3 or mail to a stakeholder.

## Quick start

For a typical request:

1. Classify the artifact type.
2. Gather the source material and identify the audience.
3. Load `references/design-system.md` plus the one artifact reference you need.
4. Start from the matching layout in `assets/layouts/`.
5. Compose with the component patterns from `references/design-system.md` (§ Component patterns), keeping all content in one `.html` file.
6. Run the end-of-run verification checklist.
7. Save the file, open it, and report the absolute path.

## Workflow

1. **Classify the artifact** (table below). Pick the closest match — it dictates which layout you start from and which patterns you compose with.

2. **Gather inputs.** Read source markdown, branch, data, prior session. For data/research artifacts, surface the underlying data first — do not produce findings from summaries of summaries.

3. **For data/research/audit artifacts: run the rigor protocol.** Read `references/research-protocol.md`. Do not draft findings until hypotheses, baselines, denominators, and audience are explicit. The protocol is a precondition, not a postcondition.

4. **Plan the structure.** Outline sections before writing HTML. For code reviews, see `references/code-review.md` (intent-cluster + cross-cutting concerns structure). For decks, see `references/deck.md`. For everything else, the matching layout in `assets/layouts/` (see classifier).

5. **Build the HTML.** Start from the closest file in `assets/layouts/`. Apply tokens and idioms from `references/design-system.md` and compose with its component patterns (§ Component patterns — KPI strip, bars, pills, cards, footnotes, etc.; hypothesis-ledger and negative-results live in `references/research-protocol.md`). **These are flexible starting points, not rigid structures** — adapt section order, add/remove sections, regroup content however the material wants. The layouts show one good arrangement; the material may call for another.

6. **Check against anti-patterns.** Read `references/anti-patterns.md` and confirm the finished artifact complies — faithful to the source the user gave you and in line with the veneer standards. The reference carries the detail; this step just sends you there.

7. **Run end-of-run verification.** Use the checklist below after writing the artifact and before telling the user it is done.

8. **Save and open.** Default path: `docs/veneer/{slug}.html` in the current repo. If the source lives in a more appropriate docs/artifact folder, save adjacent. Open with `open` so the user can see it immediately.

## Artifact classifier

All layouts live in `assets/layouts/`. They come in two shapes — **single-column** (one scrolling column, no JS: `report.html`, `code-review.html`) and **sidebar-nav** (left nav + JS-swapped sections: `deck.html`, `explainer.html`). Pick by shape, not by a one-to-one artifact mapping — every file is a flexible starting point you can restructure.

| Artifact | Source | Start from |
|---|---|---|
| Formal code review | branch diff, PR | `assets/layouts/code-review.html` (single-column, intent-clustered) |
| Presentation deck | outline / talking points | `assets/layouts/deck.html` (sidebar nav, sections swap) |
| Data report / audit / insights | data + analysis | `assets/layouts/report.html` + design-system patterns + rigor protocol |
| Research / learning / explainer | prior research, code, history | `assets/layouts/report.html` (default) — or `assets/layouts/explainer.html` when there are >4 logically separate sections that benefit from random access (see `references/design-system.md` § Layout primitives) |
| Spec / planning / handoff | doc, schema, brief | `assets/layouts/report.html` + design-system patterns |
| Prototype / design exploration | wireframes, mood | any file in `assets/layouts/`, most freedom |

## Reverse direction: HTML → Markdown

When the user wants to capture an interactive veneer artifact back as plain text — for the codebase, for sharing in a non-HTML medium, or for re-ingestion by the model in a later session — do the conversion semantically yourself. Read the HTML with the Read tool, then write the markdown directly. No deterministic parser ships with the skill; a one-to-one byte conversion would be brittle and the model can interpret the structure better than a regex pass.

Don't try to match an exact byte-for-byte format. Optimize for the next agent (or human) reading the content cold.

**What to preserve:**

- **Section structure.** Each `<section data-section="…">` becomes an `## H2`. Use the visible `<h2>` text when present; fall back to the section's `.eyebrow` or a humanized version of the `data-section` slug.
- **Findings and cards** (`[data-finding]`). Title → `### H3`. Pill text → italic tag line. Body paragraphs → prose. Denominator and baseline annotations → preserve inline so a re-ingesting model can see them.
- **Hypothesis ledger.** Each `[data-hypothesis]` item with its `data-result` (supported / not-supported / inconclusive / exploratory). Render as a clearly-labeled list.
- **Caveats demoted to footnotes.** Walk every `.footnote` element (including ones outside sections — they often live at the end of the body). Render as `[^N]: …` style footnotes. Load-bearing rule of the research protocol — caveats must survive the round-trip.
- **Code review intent clusters** (`[data-cluster]`). Cluster title → `### Cluster: …`. Cluster summary, file list, inline diff hunks (fenced ```diff blocks), annotations as blockquotes.
- **Cross-cutting concerns** (`[data-concern]`). Each as a sub-heading inside the cross-cutting section.
- **Open questions** (`[data-question]`). Title and body, formatted as a bulleted list with rationale.

**What to skip:**

- Visible CSS classes, inline styles, decorative chrome (sticky bars, expand carets, page numbers).
- Filter pills, action bars, "Copy" buttons — interaction surfaces, not content.
- Empty placeholder text like `{{LEDE}}` left over from unfilled templates.

The HTML carries semantic markers (`data-section`, `data-finding`, `data-hypothesis`, `data-result`, `data-baseline`, `data-baseline-source`, `data-denominator`, `data-caveat`) that disambiguate intent when the visible text alone is ambiguous. Use them as hints; don't require them. If the user has manually edited the HTML, do your best with what's there — the markers are convenience, not contract.

## Design system

The single source of truth lives in `references/design-system.md`. Read it before producing any HTML. Highlights:

- **Light only.** No dark mode. Paper-tinted backgrounds (`#f6f4ec`, `#faf7f2`, `#f4efe3`), warm deep ink (`#1f2624`, `#1a1612`).
- **Type stack** (always): serif display + sans body + mono eyebrows. Specific pairings per artifact type — see design-system.md.
- **No italics in headings.** Italics only in inline editorial flourishes and only when explicitly chosen — never as the default heading style.
- **No fake editorial chrome.** No "01 · 02 · 03" oversized numbers on cards or sections unless they're functional navigation.
- **Status idiom**: `border-left: 3-5px solid var(--accent)` on themed cards. Pills come as surface + foreground + border triplets.
- **Hand-rolled visualizations** preferred. Chart.js via CDN only when a real chart is needed. No D3, no Tailwind, no Mermaid by default.
- **Single HTML file by default** — inline artifact CSS and JS in the generated `.html`. External CDN dependencies are allowed for fonts, icon libraries, and chart libraries when they materially improve the artifact. If the user asks for offline/self-contained output, avoid CDN dependencies and use system fonts or inline assets.

## Anti-patterns

Before saving, audit against `references/anti-patterns.md`. The most common veneer-killers, in priority order:

1. **Italics in headings or section titles.** Strip them.
2. **Audit voice in a presentation artifact.** Rewrite for the named audience.
3. **Markdown leakage** — raw `*`, `**`, `#` characters showing through unrendered.
4. **Low contrast.** No light-gray text on lighter-gray backgrounds for body copy. Body text reads against paper.
5. **Decorative "01 · 02" numbers** with no functional purpose.
6. **Anthropic-orange / generic AI palette.** Per-artifact accents come from the editorial palette in design-system.md.
7. **Bouncy, springy, or decorative motion.** Restrained-by-default.
8. **Findings without denominators** in data artifacts.

## Output location

- Default for repo work: `docs/veneer/{slug}.html`.
- If the source lives in a more appropriate docs/artifact folder, save adjacent.
- Use `/tmp/{slug}.html` only when the user explicitly asks for a throwaway file.
- Always print the absolute path after saving so the user can `open` it.

## End-of-run verification

Run this at the end of every veneer artifact creation, after the HTML exists and before final response:

- Open the artifact locally and visually inspect the first viewport plus at least one representative section.
- Confirm the artifact complies with `references/anti-patterns.md`; fix anything that does not.
- Confirm the output has no markdown leakage (`**`, raw heading markers, bullet markers inside paragraphs).
- Confirm body copy uses readable contrast and headings are not italic by default.
- For data/research/audit artifacts, confirm denominators, baselines, caveats, open questions, and hypothesis ledger are present where required.
- For veneer-produced HTML intended for re-ingestion, mentally walk the structure — semantic markers (`data-section`, `data-finding`, footnotes) should be present where re-ingestion will need them. The reverse-direction extraction is done by the model on demand (see "Reverse direction" above); no script runs.
- For interactive artifacts, test the primary interaction (filters, expand/collapse, section nav).

## Iteration

Veneer artifacts are iterative. Expect 2-5 rounds of layout, copy, and evidence refinement. Apply changes surgically — do not regenerate the whole file on a small ask. Preserve everything not explicitly targeted by the requested change.
