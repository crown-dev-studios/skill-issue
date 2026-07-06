# Veneer Anti-Patterns

The catalog of common veneer mistakes, ordered by severity and frequency.

**Contents**

1. Italics in headings and section titles
2. Decorative editorial numbering chrome
3. Drop caps and faux-editorial flourishes
4. Markdown leakage
5. Prep-process leakage (the audience sees this cold)
6. Low-contrast body copy
7. Generic AI color palette
8. Bouncy or springy easing
9. Findings without denominators
10. Severity-relabeled caveats
11. Unrequested or half-applied changes
12. Stretched or distorted icons
13. Recreating icons by hand
14. UUIDs rendered as placeholders
15. Tables with arbitrary background colors
16. Hero typography as one monolithic block
17. Showing raw JSON instead of rendered structure
18. Non-functional hover states
19. Forcing scroll over expansion
20. Constraining "expand one at a time"

## 1. Italics in headings and section titles

**Problem**: Default heading styles set in serif italic. Reads as decorative-precious and often harms legibility.

**Fix**: All `<h1>`, `<h2>`, `<h3>`, `<h4>` default to `font-style: normal`. Eyebrows are mono uppercase, not italic. Section titles in display serif weight 500-600, normal style.

**Allowed italic use**:

- Sidebar nav taglines in decks (one specific spot).
- Inline emphasis in body copy (`<em>` for a single word or phrase).
- Pull quotes in deck sections.
- Book titles, foreign terms.

**Check before shipping**: confirm no `h1`–`h4` rule defaults to `font-style: italic`. Italic is legitimate elsewhere (sidebar taglines, pull quotes, `<em>`), so check the heading rules specifically rather than stripping italics across the board. If a heading defaults to italic, strip it.

---

## 2. Decorative editorial numbering chrome

**Problem**: Adding oversized "01 · 02 · 03" numbers next to cards or sections when those numbers don't serve as navigation. Looks fashion-mag, reads as filler.

**Fix**: Numbers earn their place only when they are functional navigation (e.g., sidebar nav rows in a deck template). Don't apply them as visual ornaments on stat cards, finding cards, or hero blocks.

**Test**: If you removed the number and the layout still made sense, the number was decoration. Remove it.

---

## 3. Drop caps and faux-editorial flourishes

**Problem**: Setting the first letter of a paragraph as a 72px+ drop cap, fleur-de-lis dividers, oversized initials, etc. Editorial-cosplay.

**Fix**: No drop caps. No decorative initial letters. The headline carries the visual weight; the paragraph reads as normal prose.

If a section truly needs a stronger opening, use a serif pull quote or a bold lede paragraph — but not a drop cap.

---

## 4. Markdown leakage

**Problem**: Raw markdown characters (`*`, `**`, `_`, `#`) appearing in the rendered HTML. Usually because markdown was pasted into an HTML element without converting.

**Fix**: Before saving, grep the output for `**`, `__`, leading `#`, ` * ` in `<p>` blocks. Convert to proper HTML: `<strong>`, `<em>`, `<h*>`, `<li>`.

**Common offenders**:

- Bullet lists ported as `* item` text.
- Bold rendered as `**bold**` instead of `<strong>`.
- Heading markers `#` showing up as page glyphs.
- Code spans rendered as `` `code` `` instead of `<code>code</code>`.

---

## 5. Prep-process leakage (the audience sees this cold)

The reader of the artifact is seeing the subject for the first time. They were not in the room while you analyzed, audited, debugged, or re-cut the data. Any language that narrates *your preparation process* — rather than the finding itself — leaks your backstage into their front-row seat.

The test: read each sentence as someone who has never seen this material. Does the sentence describe *the thing*, or does it describe *what you did to get to the thing*? If it's the latter, rewrite it to state the conclusion directly.

**Examples of leakage and the rewrite:**

- "After auditing the data, we found X." → "X." (the audit was your process; the reader only needs the result)
- "We corrected the denominator and now see Y." → "Measured against the right population (N=…, window=…), Y." (state the basis, not the correction event)
- "There was a discrepancy we resolved." → "The figure differs from the dashboard because the dashboard counts trials; this counts conversions."
- "This needs more validation / TBD / as noted earlier." → either resolve it before presenting, or move it to a clearly-labeled "open questions" section.
- Internal codenames, ticket numbers, "the audit", "the re-run" — strip or introduce them in the reader's terms.

The same word can be fine or wrong depending on intent and audience. "Audit" in a compliance report written *for auditors* is correct. "Audit" in a practice-owner presentation is prep-process leakage. Judge the intent, not the token.

Exception: when the audience genuinely is engineering/internal and the process *is* the subject (a methodology writeup, a post-incident review), process language is the content. Declare the audience up front (see `references/research-protocol.md`) and let that decide.

---

## 6. Low-contrast body copy

**Problem**: Body text in `--ink-muted` or `--ink-faint`, making paragraphs hard to read. Often paired with a light background, killing legibility.

**Fix**:

- Body paragraphs use `--ink` on `--paper`. Contrast must be ≥10:1.
- `--ink-soft` is acceptable for secondary body (intros, ledes) but never for the main read.
- `--ink-muted` and `--ink-faint` are for captions, footnotes, eyebrows, and labels — never paragraph body.
- If a panel is dark (rare in veneer — usually only sidebars), invert to near-white-on-near-black. No muted-gray text on dark backgrounds.

---

## 7. Generic AI color palette

**Problem**: Using anthropic-orange (`#cc785c`, `#d97757`), bootstrap blue (`#0d6efd`), Chart.js default colors, or pure CSS named colors. These telegraph "AI made this."

**Fix**: Use only the editorial palette tokens from `references/design-system.md`. When using Chart.js, override defaults with editorial palette colors. When importing an icon library that has its own colors (Phosphor doesn't, by default), strip them.

**Specific bans**:

- Any `#cc785c` / `#d97757` / amber gradients.
- Any saturated bootstrap blues.
- Chart.js's default red/green palette.
- Pure `red`, `blue`, `purple`, `green` CSS keywords.

---

## 8. Bouncy or springy easing

**Problem**: `cubic-bezier(0.34, 1.56, 0.64, 1)` and friends. Reads as toy-app and draws attention away from the content.

**Fix**: Use `cubic-bezier(0.2, 0.0, 0.2, 1)` (default ease) or `cubic-bezier(0.0, 0.0, 0.2, 1)` (ease-out). Durations 120-180ms for hover, 180-280ms for section swaps. Nothing longer than 280ms by default.

---

## 9. Findings without denominators

**Problem**: "47% of accounts have X" with no N, no window, no population definition.

**Fix**: Every percentage gets a `(N=…, window=…)` annotation. See `references/research-protocol.md` for the full denominator rule.

---

## 10. Severity-relabeled caveats

**Problem**: A finding whose interpretation depends on a caveat gets demoted from "High" to "Medium" severity. It is still presented as a finding instead of footnoted.

**Fix**: Caveats demote to footnotes (`<sup>` reference + matching `<aside class="footnote">`), not to a lower severity pill. If a finding only stands up with a caveat, it doesn't belong as a top-level finding — it belongs in an "open questions" or "context to keep in mind" section.

---

## 11. Unrequested or half-applied changes

**Problem**: Two failure modes. (1) A revision updates one part of the artifact but leaves related parts stale — a metric is corrected in the KPI strip while the lede, a finding card, and its footnote still cite the old number, so the artifact now contradicts itself. (2) A narrow request is read broadly — asked to retitle one section, the model also reorders sections, rewrites finding copy, and swaps the accent palette.

**Fix**: Change only what was asked, and propagate that change everywhere it is load-bearing. Read the existing file first; make the surgical edit; if a changed number or label appears elsewhere, update every instance so nothing contradicts; leave everything unrelated untouched. When a request could be read narrowly or broadly, take the narrow reading or ask.

---

## 12. Stretched or distorted icons

**Problem**: Phosphor icon scaled with `width: 24px; height: 16px` or similar non-square dimensions. Reads as broken.

**Fix**: Phosphor icons render at `1em` with `aspect-ratio: 1`. Size icons by `font-size` on a parent, not by setting `width`/`height` separately. Never apply `transform: scaleX(…)` or `scaleY(…)` to an icon.

---

## 13. Recreating icons by hand

**Problem**: Drawing custom checkmarks, arrows, carets as inline SVG when a Phosphor icon would do.

**Fix**: Reach for Phosphor first. Only hand-roll an icon if the needed glyph doesn't exist in Phosphor (rare).

---

## 14. UUIDs rendered as placeholders

**Problem**: When data has no human-readable label, rendering the UUID or rendering `--` / `null` / `N/A` as a stand-in.

**Fix**: If there's no human-readable value, render nothing — empty cell, omitted line. Don't display `--`, `null`, `undefined`, or the UUID. The absence of the value carries information; the placeholder text does not.

---

## 15. Tables with arbitrary background colors

**Problem**: Striped rows in alternating gray, or status-colored row backgrounds, fighting the editorial paper aesthetic.

**Fix**: Tables stay on `--panel` (or `--paper`). Distinguish rows with hairline `1px solid var(--hair)` borders. Status indicated via inline pills or left-border idiom, never a row-tinted background.

---

## 16. Hero typography as one monolithic block

**Problem**: `<h1>` set in a single uniform style and color across two or three lines of text. Reads heavy and bland.

**Fix**: When the hero is multi-line, stack the words intentionally. Vary weight, color (`--ink` for the loud line, `--panel`/`--paper-warm` text-color for the muted line), or scale. Example:

```html
<h1 class="hero">
  <span class="hero-line-1">The case for</span>
  <span class="hero-line-2">editorial HTML</span>
</h1>
```

```css
.hero-line-1 { display: block; font-weight: 400; color: var(--ink-soft); }
.hero-line-2 { display: block; font-weight: 600; color: var(--ink); }
```

---

## 17. Showing raw JSON instead of rendered structure

**Problem**: An object that has a clean shape (for example, named sections with predictable ordering) gets dumped as a `<pre>` JSON block.

**Fix**: Parse the data. Render the actual structure with semantic HTML, headings, and styled sections. JSON blocks are only acceptable when the artifact is genuinely about the raw structure (API reference, technical handoff).

---

## 18. Non-functional hover states

**Problem**: Adding hover effects to elements that are not actually clickable. Or making the hover state so dark it looks broken.

**Fix**:

- No hover effect on non-interactive elements.
- For interactive elements, hover state is a subtle change (`background: rgba(0,0,0,0.02)`, never a dark overlay).
- If clickability isn't obvious, add an affordance (caret-up-down icon, "open" link, etc.) — not just hover.

---

## 19. Forcing scroll over expansion

**Problem**: Lots of small items in a vertical list forcing the user to scroll to see them all.

**Fix**: When a list is long, default to **expand-on-click** instead of scrolling. The sidebar-nav layout shape (`assets/layouts/deck.html` or `explainer.html`) is one solution. For feed-like content, collapse rows by default and expand inline on click. Don't make the user scroll a 50-item list.

---

## 20. Constraining "expand one at a time"

**Problem**: When an interactive artifact supports expanding items, only allowing one to be expanded at a time. The reader has to close one to see another.

**Fix**: Support multiple simultaneous expansions. The user gets to decide what they need open.
