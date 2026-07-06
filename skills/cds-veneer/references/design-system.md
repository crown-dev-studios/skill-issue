# Veneer Design System

The single source of truth for veneer artifacts. Read top-to-bottom on first invocation; reference specific sections thereafter.

## Table of contents

1. [Philosophy](#philosophy)
2. [Color tokens](#color-tokens)
3. [Typography](#typography)
4. [Layout primitives](#layout-primitives)
5. [Status idioms](#status-idioms)
6. [Visualizations](#visualizations)
7. [Icons](#icons)
8. [Animation policy](#animation-policy)
9. [Single-file output rules](#single-file-output-rules)
10. [Per-artifact accent palettes](#per-artifact-accent-palettes)
11. [Reference fingerprints](#reference-fingerprints)
12. [Component patterns](#component-patterns)

---

## Philosophy

Veneer borrows from print editorial design (NYTimes web features, The Browser Company blog), modern minimal product (Linear, Giga inverted to light mode), and the cleanliness of Apple. The output should feel like a publication, not a dashboard. Quiet, generous, considered. The reader's eye should land on one element per fold.

Three rules govern everything:

1. **Light, paper-tinted backgrounds.** Never dark mode. Never pure white as the base.
2. **Editorial type hierarchy.** Serif display + sans body + mono eyebrows. The serif is the loud voice; everything else gets out of its way.
3. **Restraint over decoration.** Motion, color, and chrome must justify themselves. When in doubt, remove.

---

## Color tokens

All colors live as CSS custom properties on `:root`. Use the tokens; never hardcode hex.

### Paper foundation (always use one set)

```css
:root {
  --paper:      #f6f4ec;  /* editorial cream, default */
  --paper-warm: #ebe6d8;  /* alternate band / sidebar */
  --panel:      #fffdf7;  /* raised surface */
}
```

Three paper foundations to pick from per artifact (all light):

- **Editorial cream** — `--paper: #f6f4ec` (default for reports, decks, code reviews)
- **Botanical** — `--paper: #faf7f2` (softer, for prototypes and design specs)
- **Warm paper** — `--paper: #f4efe3` (oxblood-accent reports, readiness assessments)

### Ink

```css
:root {
  --ink:       #1f2624;  /* primary text */
  --ink-soft:  #3b3429;  /* secondary text */
  --ink-muted: #756a58;  /* tertiary text, captions */
  --ink-faint: #a89e8a;  /* quaternary, eyebrows */
}
```

Body copy contrast: `--ink` on `--paper` = ~13:1. Never use `--ink-muted` for paragraph body. Use it only for captions, footnotes, and labels.

### Rules and lines

```css
:root {
  --rule: #d9ddd6;       /* primary divider */
  --hair: #ececec;       /* fine hairline */
}
```

### Accents (pick a per-artifact palette, see below)

The default ("editorial spectrum"):

```css
:root {
  --accent:     #496f59;  --accent-soft:    #e7eee7;  /* sage green */
  --info:       #386b7f;  --info-soft:      #e4eef3;  /* deep blue */
  --warn:       #9c7135;  --warn-soft:      #f5ece0;  /* aged gold */
  --alert:      #985d57;  --alert-soft:     #f5e8e6;  /* terracotta red */
  --emphasis:   #665f7c;  --emphasis-soft:  #ece9f1;  /* dusty violet */
}
```

Every status color comes in a **pair** — a saturated foreground/border tone and a soft tint suitable as a card surface. Never use the saturated tone as a card background.

### Forbidden palettes

- **Anthropic orange / amber** — `#cc785c`, `#d97757`, and friends. These read as generic AI immediately.
- **Pure CSS named colors** — `red`, `blue`, `purple` — too saturated, too web-1.0.
- **Bootstrap primary blue** — `#0d6efd`. Generic product chrome.
- **Tailwind defaults at full saturation** — same problem.

---

## Typography

### Type stacks (pick one set per artifact)

**Editorial classic** (default, for reports/audits/decks):

```css
--font-display: 'Newsreader', 'Newsreader Variable', Georgia, 'Times New Roman', serif;
--font-body:    'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
--font-mono:    'JetBrains Mono', 'SF Mono', Menlo, monospace;
```

**Display newsprint** (for editorial verdict / formal readiness):

```css
--font-display: 'Fraunces', 'Newsreader', Georgia, serif;
--font-body:    'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:    'JetBrains Mono', monospace;
```

**System editorial** (when offline/CDN-blocked):

```css
--font-display: Georgia, 'Times New Roman', serif;
--font-body:    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono:    'SF Mono', Menlo, monospace;
```

**Prototype/spec** (interactive mockups, more humane feel):

```css
--font-display: 'Lora', Georgia, serif;
--font-body:    'Nunito', -apple-system, sans-serif;
--font-mono:    'JetBrains Mono', monospace;
```

### Loading fonts

Always include Google Fonts preconnect to avoid jank:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

For Fraunces with variable axes (only when actually using `opsz`/`SOFT`/`WONK`):

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,400..700,30..100,0..1&display=swap" rel="stylesheet">
```

### Scale

Use `clamp()` for fluid sizing. Reference scale:

```css
--type-display: clamp(2.4rem, 5vw, 4.4rem);   /* H1, page title */
--type-h1:      clamp(1.8rem, 3.2vw, 2.8rem); /* section title */
--type-h2:      clamp(1.3rem, 2.2vw, 1.7rem); /* subsection */
--type-h3:      1.15rem;                       /* card title */
--type-body:    1rem;                          /* body */
--type-small:   0.875rem;                      /* small body */
--type-eyebrow: 0.78rem;                       /* eyebrow label */
--type-caption: 0.75rem;                       /* footnote */
```

Line heights:

- Display: 0.95 to 1.05
- Body: 1.55 to 1.7
- Captions: 1.4

### Tracking (letter-spacing)

- Display headlines: `-0.02em` to `-0.028em` (tighten)
- Body: `0`
- Eyebrows (mono uppercase): `0.10em` to `0.22em` (loose)
- Pills / labels: `0.05em` to `0.08em`

### Eyebrow pattern (use everywhere)

```html
<header class="eyebrow-headline">
  <p class="eyebrow">Vol. I · No. 3</p>
  <h1>The headline takes the room</h1>
  <p class="lede">A muted serif lede sits one rung quieter than the headline.</p>
</header>
```

```css
.eyebrow {
  font-family: var(--font-mono);
  font-size: var(--type-eyebrow);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--ink-muted);
  margin: 0 0 var(--space-3) 0;
}
.eyebrow-headline h1 {
  font-family: var(--font-display);
  font-size: var(--type-display);
  line-height: 0.98;
  letter-spacing: -0.025em;
  margin: 0;
}
.lede {
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 1.8vw, 1.4rem);
  color: var(--ink-soft);
  font-weight: 400;
  line-height: 1.4;
  max-width: 60ch;
}
```

### Italics policy

**Italics are never the default heading style.** Inline italics are fine for emphasis in body copy and for explicitly requested editorial flourishes in display text — but never as a heading default. If a generated artifact has italic section titles, fix it.

Allowed italic use:

- One-word editorial flourish in a display headline ("The *unreasonable* effectiveness of HTML") — only with explicit permission.
- Book titles, foreign terms, ship names in body copy.
- Quotations rendered as blockquotes (use the `cite` style instead of italics if possible).

Disallowed italic use:

- Default `<h1>`, `<h2>`, `<h3>` styling.
- Eyebrow labels.
- Pill text.
- Nav items.
- Card titles.

### Number rendering

Use `font-variant-numeric: tabular-nums` for any column of numbers (KPI strips, tables). Mono font is fine for the number itself; the surrounding text stays sans.

```css
.kpi-value { font-variant-numeric: tabular-nums; }
table.data td.num { font-variant-numeric: tabular-nums; text-align: right; }
```

---

## Layout primitives

### Spacing scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 64px;
  --space-7: 96px;
}
```

### Widths

```css
:root {
  --max-content: 920px;   /* report column — the one width token templates actually declare */
}
```

`--max-content` (~920px) is the default report column. For a denser dashboard widen to ~1240px; for a personal-essay feel narrow to ~640px. Set these per artifact directly rather than as global tokens — only `--max-content` earns a token because every layout uses it.

### Layout starting points

All layouts live in `assets/layouts/`. Each file is a flexible starting point — restructure it freely to fit the material. Two shapes:

**Single-column** (one scrolling column, no JS):
- **`assets/layouts/report.html`** — centered column, single scroll. Default for reports, audits, specs.
- **`assets/layouts/code-review.html`** — intent-clustered code review.

**Sidebar-nav** (left section nav + JS-swapped sections, print stylesheet):
- **`assets/layouts/explainer.html`** — content swap on click, for long content where random access beats continuous scrolling.
- **`assets/layouts/deck.html`** — shareable presentation deck.

When to use a sidebar-nav layout: if the content has >4 logically separate sections that benefit from random access. Otherwise single column.

### Section structure

```html
<section class="section" data-section="findings">
  <header class="section-header">
    <p class="eyebrow">Section 03</p>
    <h2>Three findings worth acting on</h2>
  </header>
  <div class="section-body">
    <!-- content -->
  </div>
</section>
```

```css
.section { padding: var(--space-7) 0; border-top: 1px solid var(--rule); }
.section:first-of-type { border-top: 0; padding-top: var(--space-5); }
.section-header { margin-bottom: var(--space-5); }
```

### Cards

Themed cards use `border-left: 3-5px solid` as the status accent — never a colored background, never a colored border on all sides. The body of the card is `--panel` (raised) or `--paper` (flush).

```html
<article class="card card--accent">
  <header class="card-header">
    <p class="eyebrow">Finding 02</p>
    <h3>What changed</h3>
  </header>
  <p>Body copy.</p>
</article>
```

```css
.card {
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: var(--space-4);
}
.card--accent   { border-left: 4px solid var(--accent); }
.card--info     { border-left: 4px solid var(--info); }
.card--warn     { border-left: 4px solid var(--warn); }
.card--alert    { border-left: 4px solid var(--alert); }
.card--emphasis { border-left: 4px solid var(--emphasis); }
```

Border-radius is `2px` or `0`, never higher. Veneer is squared, print-feel.

### Grain (optional)

For long-form essays and readiness verdicts, an inline SVG noise overlay adds paper feel. Apply sparingly — never on dense data reports.

```css
body::before {
  content: '';
  position: fixed; inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  pointer-events: none;
  mix-blend-mode: multiply;
  z-index: 1;
  opacity: 0.6;
}
```

---

## Status idioms

### Pills (surface + fg + border)

Every status pill is a **triplet** — soft surface background, saturated foreground, hairline border. Never a saturated background.

```html
<span class="pill pill--accent">Verified</span>
<span class="pill pill--warn">Needs review</span>
<span class="pill pill--alert">Blocker</span>
```

```css
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: var(--type-caption);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
}
.pill--accent   { background: var(--accent-soft);   color: var(--accent);   border-color: rgba(73,111,89,0.25); }
.pill--info     { background: var(--info-soft);     color: var(--info);     border-color: rgba(56,107,127,0.25); }
.pill--warn     { background: var(--warn-soft);     color: var(--warn);     border-color: rgba(156,113,53,0.25); }
.pill--alert    { background: var(--alert-soft);    color: var(--alert);    border-color: rgba(152,93,87,0.25); }
.pill--emphasis { background: var(--emphasis-soft); color: var(--emphasis); border-color: rgba(102,95,124,0.25); }
.pill--neutral  { background: transparent;          color: var(--ink-muted); border-color: var(--rule); }
```

### Left-border-as-status (cards, sections, findings)

The canonical status idiom. 3-5px solid colored bar on the left edge of any element that has a category or severity:

```css
.finding { border-left: 4px solid var(--accent); padding-left: var(--space-4); }
.finding--blocker  { border-left-color: var(--alert); }
.finding--question { border-left-color: var(--emphasis); }
.finding--verified { border-left-color: var(--accent); }
```

### Footnoted caveats

Caveats that explain when a finding is shaky get demoted to footnotes — not rendered with their own severity pill at the top of the page. The "caveat demotion" rule is enforced; see `references/research-protocol.md`.

```html
<p>
  Repeat contacts rose 14% YoY<sup class="fn" data-fn="1">1</sup>.
</p>
<aside class="footnote" id="fn-1">
  <span class="fn-num">1</span>
  <span>Could reflect a tracking-policy change in late 2024 rather than a real behavior change. Recommend a stratified re-cut.</span>
</aside>
```

```css
.fn {
  font-family: var(--font-mono);
  font-size: 0.72em;
  color: var(--ink-muted);
  text-decoration: none;
  margin-left: 2px;
}
.footnote {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: var(--space-2);
  font-size: var(--type-small);
  color: var(--ink-muted);
  padding-top: var(--space-3);
  border-top: 1px solid var(--hair);
  margin-top: var(--space-4);
}
.fn-num {
  font-family: var(--font-mono);
  color: var(--ink);
}
```

---

## Visualizations

### Preference order

1. **Hand-rolled HTML/CSS bars** — for most data. A `<div class="bar-bg"><div class="bar" style="width:48%"></div></div>` outperforms a chart library 90% of the time.
2. **Inline SVG sparklines** — for in-line trend indicators.
3. **Chart.js via CDN** — only when a real chart (multi-series, axis-labeled, dense) is needed. Always loaded as a single `<script>` tag, never npm/bundled.
4. **D3 / Recharts / Mermaid** — by exception only, with explicit reason. They pull weight in single-file output.

### Bars

```html
<div class="bar-row">
  <span class="bar-label">Completions</span>
  <div class="bar-bg"><div class="bar bar--accent" style="width:62%"></div></div>
  <span class="bar-value">62%</span>
</div>
```

```css
.bar-row { display: grid; grid-template-columns: 1fr 2fr 60px; gap: var(--space-3); align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--hair); }
.bar-label { font-size: var(--type-small); color: var(--ink-soft); }
.bar-bg { background: var(--paper-warm); height: 8px; border-radius: 1px; overflow: hidden; }
.bar { height: 100%; background: var(--accent); }
.bar-value { font-family: var(--font-mono); font-size: var(--type-small); text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); }
```

A **funnel** is just a stack of these bars with descending widths and a label per stage — no separate component.

### KPI strip

3–5 metrics in a horizontal band. Every KPI must carry a denominator and a baseline (see `references/research-protocol.md`); the `data-*` attributes make the figure legible to a re-ingesting model.

```html
<div class="kpi-strip" data-section="kpis">
  <div class="kpi" data-finding="activation-rate"
       data-denominator="N=12,840 accounts trailing 12mo"
       data-baseline="industry" data-baseline-source="Benchmark 2024">
    <p class="kpi-value">47%</p>
    <p class="kpi-meta">N=12,840 · 12 mo · vs. benchmark 55–60%</p>
    <p class="kpi-label">Accounts reaching activation</p>
  </div>
  <div class="kpi" data-finding="repeat-contact" data-caveat="true">
    <p class="kpi-value">14%</p>
    <p class="kpi-meta">YoY ▲</p>
    <p class="kpi-label">Repeat contact rate<sup class="fn"><a href="#fn-1">1</a></sup></p>
  </div>
</div>
```

```css
.kpi-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-4); padding: var(--space-4) 0; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
.kpi-value { font-family: var(--font-display); font-size: clamp(1.6rem, 3vw, 2.4rem); line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; margin: 0 0 var(--space-1) 0; }
.kpi-meta { font-family: var(--font-mono); font-size: var(--type-caption); color: var(--ink-muted); margin: 0 0 var(--space-1) 0; letter-spacing: 0.05em; }
.kpi-label { font-size: var(--type-small); color: var(--ink-soft); margin: 0; }
```

### Sparkline row

Inline SVG trend indicator as a list row. No library.

```html
<div class="sparkline-row" data-finding="completion-trend">
  <div class="spk-label">
    <span class="spk-name">Completion rate, trailing 12 mo</span>
    <span class="spk-meta">N = 12,840</span>
  </div>
  <svg class="sparkline" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="0,18 20,17 40,14 60,12 80,10 100,8 120,6"
              fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
  <span class="spk-value">51%</span>
  <span class="spk-delta spk-delta--up">+6pp</span>
</div>
```

```css
.sparkline-row { display: grid; grid-template-columns: 1fr 120px 70px 60px; gap: var(--space-3); align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--hair); }
.spk-label { display: flex; flex-direction: column; }
.spk-name { font-size: var(--type-small); color: var(--ink); }
.spk-meta { font-family: var(--font-mono); font-size: var(--type-caption); color: var(--ink-muted); }
.sparkline { height: 28px; width: 100%; color: var(--accent); }
.spk-value { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; color: var(--ink); font-size: var(--type-small); }
.spk-delta { font-family: var(--font-mono); font-size: var(--type-caption); text-align: right; }
.spk-delta--up { color: var(--accent); } .spk-delta--down { color: var(--alert); }
```

### Chart.js loading (when needed)

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
```

Configure Chart.js to use the veneer palette explicitly — never the Chart.js defaults:

```js
Chart.defaults.font.family = "'Geist', -apple-system, sans-serif";
Chart.defaults.color = '#3b3429';
Chart.defaults.borderColor = '#d9ddd6';
```

### Diagrams

Inline SVG for flowcharts, system diagrams, illustrations. Avoid Mermaid — its default styling fights everything else. If a diagram is genuinely needed, hand-roll the SVG or commission a separate asset.

---

## Icons

Use Phosphor for any icon need when a matching glyph exists.

```html
<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>

<i class="ph ph-trend-up"></i>
<i class="ph-duotone ph-chart-line"></i>
<i class="ph ph-caret-up-down"></i>
```

Common Phosphor names:

- `trend-up`, `trend-down`
- `chart-line`
- `flask`
- `home`
- `paper-plane-tilt`
- `caret-up-down` (expansion indicator — preferred over arrows)

Notes:

- Use the **regular** weight by default (`ph`). Duotone (`ph-duotone`) only when the duotone is meaningful.
- **Never wrap a Phosphor icon in a circle** unless the design genuinely needs a target.
- Don't recreate Phosphor's icons by hand. If a needed icon is missing, switch to an inline SVG with similar visual weight.

---

## Animation policy

Restrained by default. Motion has to earn its place.

### By artifact type

- **Reports / audits / specs / explainers**: zero animation. Static print-feel.
- **Code reviews**: collapse/expand on cluster sections only, ~150ms ease-out. No scroll-driven motion.
- **Decks**: subtle fade on section swap (~150ms). No slide-in, no spring.
- **Prototypes / mockups**: hover transitions up to 180ms. Nothing bouncier than `cubic-bezier(0.2, 0.0, 0.2, 1)`. Only motion that conveys meaning (a Manus-style morph from search-to-chat) is welcome.

### Forbidden

- Bouncy or springy easing on report/audit/spec artifacts.
- Scroll-jacked / scroll-tied animations.
- Fade-in-on-load (chrome that delays reading).
- Hover transitions longer than 250ms.
- Animations that loop indefinitely without user intent.

### Tokens

```css
:root {
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --ease:          cubic-bezier(0.2, 0.0, 0.2, 1);
}
```

---

## Single-file output rules

Veneer artifacts ship as **one HTML file** by default. The reader should be able to open the file directly without running a server.

### Inline artifact code

- `<style>` in `<head>` — no external stylesheets.
- `<script>` in `<head>` or before `</body>` — no external JS files.
- Fonts via Google Fonts CDN — acceptable, single-line preconnect.
- Chart.js via CDN — acceptable when needed.
- Phosphor icons via CDN — acceptable.
- Images: prefer inline SVG. If raster, base64-encode for true portability or accept the external dependency with intent.

### Split is allowed only when:

- The artifact is a multi-section deck with >800 lines of HTML (e.g., 7+ sections), AND
- The user is going to host it from a controlled path, AND
- The tradeoff has been explained and accepted.

Split artifacts are the exception, not the rule.

### Page head boilerplate

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{title}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>/* tokens + page styles */</style>
</head>
```

---

## Per-artifact accent palettes

The base tokens give you `--accent`, `--info`, `--warn`, `--alert`, `--emphasis`. But the **base accent** (`--accent`) is tuned per artifact. Pick once at the top of the file; the rest of the palette adjusts in service of the chosen story.

| Artifact intent | `--accent` | Notes |
|---|---|---|
| Operational dashboard / business insights | `#496f59` sage | Grounded, trustworthy. Default. |
| Editorial verdict / readiness assessment | `#8a2317` oxblood | One serious voice on warm paper. |
| Design exploration / prototype | `#6b8e72` botanical sage | Softer, more humane. Use Lora/Nunito stack. |
| Engineering review / code review | `#386b7f` deep blue | Cool, technical. |
| Research / learning / explainer | `#665f7c` dusty violet | Inquiry-mode. |
| Audit / compliance | `#9c7135` aged gold | Authoritative but not alarming. |

Within a single artifact, the four supporting status colors (`--info`, `--warn`, `--alert`, `--emphasis`) stay in the editorial spectrum — never mix in an out-of-palette accent.

---

## Reference fingerprints

Three reference points sharpen the visual target.

### The Browser Company blog + NYTimes editorial features

- Generous serif headlines with negative-leading body.
- Mono eyebrows tracked wide.
- Hairline rules, no boxed shadows.
- Pull quotes set in display serif at 1.3-1.5× body.
- Photos crop wide and run full bleed when used (rare in veneer; we prefer SVG and data viz).

### Linear, inverted to light mode

- Mono labels at 11-13px, uppercase, tracked 0.10-0.18em.
- Tight vertical rhythm; lots of breathing horizontally.
- Restrained pill palette with single saturated accent per context.
- Subtle 1px hairlines do all dividing work — no heavy borders.

### Giga.ai, inverted

- Quiet hero, big serif headline, mono kicker.
- Single accent color used sparingly (in pills, link underline, chart highlight).
- Cards are flat, no shadows; relief comes from `--panel` vs `--paper` contrast.

### Apple (cleanliness)

- One element wins per scroll position.
- Aggressive negative space.
- Numbers as the hero when the artifact is data.

---

## Component patterns

These are the building blocks of a veneer artifact. There is **no separate snippets directory** — this file is the single source of truth. Copy the markup + CSS from the section listed, adapt the content, and keep everything inline in the one output `.html`. Maintaining the markup in one place is deliberate: when it lived in both a snippet file and here, the two drifted (three separate review findings were snippet-vs-layout CSS mismatches).

| Pattern | Where the canonical markup + CSS lives |
|---|---|
| Eyebrow + headline + lede | § Typography → Eyebrow pattern |
| Section structure | § Layout primitives → Section structure |
| Status card (left-border accent) | § Layout primitives → Cards |
| Pill cluster (surface + fg + border) | § Status idioms → Pills |
| Footnoted caveat | § Status idioms → Footnoted caveats |
| Bars / funnel | § Visualizations → Bars |
| KPI strip | § Visualizations → KPI strip |
| Sparkline row | § Visualizations → Sparkline row |
| Phosphor icons | § Icons |
| Hypothesis ledger | `references/research-protocol.md` → The two mandatory sections |
| Negative results / "what we couldn't answer" | `references/research-protocol.md` → The two mandatory sections |

Patterns are flexible starting points, not rigid components — adapt structure to the material.

## Quick checklist before shipping any veneer

- [ ] Light background (`--paper`), warm deep ink (`--ink`). No dark mode.
- [ ] Serif display + sans body + mono eyebrows. No italic section titles.
- [ ] Status uses left-border + pill triplets — no colored card backgrounds.
- [ ] No decorative "01 · 02" numbering chrome unless it's functional nav.
- [ ] No anthropic-orange, no bootstrap blue, no default Chart.js palette.
- [ ] Body text reads at high contrast — no muted-gray paragraph copy.
- [ ] No bouncy / springy easing. Motion ≤180ms.
- [ ] Single HTML file, with CDN dependencies only when intentional.
- [ ] Data findings have denominators, baselines, and audience-appropriate voice.
- [ ] Caveats demoted to footnotes, not relabeled severities.
- [ ] No raw markdown chars (`*`, `**`, `#`) leaking through.
