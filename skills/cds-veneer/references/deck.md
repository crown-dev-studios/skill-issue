# Deck Template Guide

**Contents**
1. [When to use the deck template](#when-to-use-the-deck-template)
2. [Structure](#structure)
3. [Recommended section count](#recommended-section-count)
4. [Section order (default narrative spine)](#section-order-default-narrative-spine)
5. [Sidebar nav styling](#sidebar-nav-styling)
6. [Section transitions](#section-transitions)
7. [Mobile](#mobile)
8. [Print](#print)
9. [Quick checklist before shipping a deck](#quick-checklist-before-shipping-a-deck)

Veneer's presentation deck template (`assets/layouts/deck.html`) is for shareable, single-file decks — not slide decks meant to project from. Think of it as a long-form web essay with a sidebar nav, optimized for someone reading on their own time on a laptop or phone.

The structure below is a flexible starting point — section count, order, and the narrative spine are guidance, not a fixed mold. Restructure freely to fit the material.

## When to use the deck template

Use it when:

- The artifact has 4-12 sections that benefit from random access.
- The reader is consuming asynchronously (you're not presenting it live).
- The information has a narrative spine (intro → context → findings → recommendation → appendix).
- Scroll fatigue is a real concern at the length the artifact will reach.

Don't use the deck template for:

- Live presentations from a projector — export to PDF or use Keynote/PowerPoint instead.
- Short artifacts (<3 sections) — use the `assets/layouts/report.html` layout.
- Dense data dashboards — use a dashboard layout, not a deck.

## Structure

The deck is a two-column layout: left sidebar nav, right content panel. Sections are siblings; only one is visible at a time. Navigation switches the active section with a subtle fade (150ms).

### Sidebar (`<aside class="deck-nav">`)

- **Masthead** at the top: publication-style identity. Volume/Issue, audience, date.
- **Numbered section nav**: each section gets a row with a mono numeral (`01`, `02`, …), section title in serif, and an optional muted serif italic tagline. The numerals here are functional navigation, so they are allowed.
- **Footer**: author / contact / source link.

The sidebar sticks on desktop; on mobile it collapses to a top bar with a toggle.

### Content panel (`<main class="deck-content">`)

Each section is a `<section class="deck-section" data-section="…">` with `.hidden` on all but the active one. JS toggles `.hidden` on nav click and animates the swap.

#### Standard section structure

1. **Eyebrow** with section number and audience hint.
2. **Headline** — the question this section answers, set in display serif.
3. **Lede paragraph** — one sentence stating the takeaway. Reader who reads only this paragraph should still walk away with the section's value.
4. **Body** — the analysis, structured with subheaders, cards, bars, and pills as needed.
5. **Quote / pull-quote** (optional) — a single insight elevated to display weight.
6. **Footnotes** — caveats and citations belong here, not inline.

#### Section pattern recipes

Different section types call for different internal structures:

- **Context / framing** section: short, mostly prose, no data viz. The reader needs to know what they're looking at before the data hits.
- **Findings** section: 3-6 finding cards, each with a headline, body, baseline reference, denominator, and footnotes.
- **Method / how-we-looked-at-this** section: explains the data, the queries, the limitations. Bullet list is fine.
- **Recommendations** section: numbered next steps, each with a one-line "why" and a "what'd it cost / what'd it move" mini-strip.
- **Appendix / hypotheses** section: dense reference material. Smaller type, more compact spacing.

## Recommended section count

Sweet spot: **5-8 sections**. Below 5 and the sidebar is overkill; above 8 and the reader gets lost. If you're at 12+ sections, the artifact is probably actually two decks.

## Section order (default narrative spine)

Most decks follow this arc. Deviate only with reason.

1. **Hero / context** — what this is and who it's for.
2. **TL;DR** — the answer in 3 bullets. (Don't make the reader work to find the punchline.)
3. **Method** — how we looked at it.
4. **Findings** — the substantive sections (often 2-3 of these).
5. **What this means** — implications, recommendations.
6. **What we couldn't answer** — open questions.
7. **Appendix** — hypotheses, data sources, definitions.

## Sidebar nav styling

The sidebar nav uses this pattern:

```html
<aside class="deck-nav">
  <div class="masthead">
    <p class="eyebrow">Vol. I · No. 3</p>
    <h1 class="masthead-title">Annual Operations Review</h1>
    <p class="masthead-meta">For Operations Leadership · May 2026</p>
  </div>
  <nav class="deck-nav-list">
    <a href="#" class="nav-row active" data-target="hero">
      <span class="nav-num">01</span>
      <span class="nav-text">
        <span class="nav-title">Where this began</span>
        <span class="nav-tag">Context for the next 30 minutes.</span>
      </span>
    </a>
    <a href="#" class="nav-row" data-target="tldr">
      <span class="nav-num">02</span>
      <span class="nav-text">
        <span class="nav-title">The short version</span>
        <span class="nav-tag">If you read nothing else, read this.</span>
      </span>
    </a>
    <!-- ... -->
  </nav>
  <footer class="masthead-footer">
    <p>Prepared by …</p>
  </footer>
</aside>
```

```css
.deck-nav { background: var(--paper-warm); padding: var(--space-5) var(--space-4); position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.nav-row { display: grid; grid-template-columns: 32px 1fr; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--rule); text-decoration: none; color: var(--ink); }
.nav-row.active .nav-title { color: var(--accent); }
.nav-num { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.85rem; padding-top: 4px; }
.nav-title { font-family: var(--font-display); font-size: 1.05rem; display: block; }
.nav-tag { font-family: var(--font-display); font-style: italic; color: var(--ink-muted); font-size: 0.9rem; display: block; line-height: 1.3; margin-top: 2px; }
```

Note: this is one place italics are allowed — the sidebar tagline. It's a controlled, intentional editorial flourish, not a default heading style.

## Section transitions

Default: opacity fade, 150ms ease-out, no movement — applied **only to the section the click reveals**, never to the base section selector.

The fade lives on an `.is-entering` class the click handler adds to the target section. The section visible at initial load never carries `.is-entering`, so it does not animate. **Do not put the animation on the base `.deck-section` selector** — that fades the first section in on page load, which the design system forbids (fade-in-on-load is chrome that delays reading).

```js
document.querySelectorAll('.nav-row').forEach(row => {
  row.addEventListener('click', e => {
    e.preventDefault();
    const target = row.getAttribute('data-target');
    document.querySelectorAll('.deck-section').forEach(s => {
      const isTarget = s.getAttribute('data-section') === target;
      s.classList.toggle('hidden', !isTarget);
      s.classList.toggle('is-entering', isTarget);
    });
    document.querySelectorAll('.nav-row').forEach(n => n.classList.toggle('active', n === row));
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
});
```

```css
.deck-section.hidden { display: none; }
.deck-section { display: block; }
.deck-section.is-entering { animation: fadeIn 150ms ease-out; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
```

## Mobile

On mobile (≤768px), collapse the sidebar to a top bar with a section title and a menu toggle. Tapping the toggle reveals the full nav as a full-screen overlay.

```css
@media (max-width: 768px) {
  .deck-nav { position: fixed; top: 0; left: 0; right: 0; height: auto; padding: var(--space-3); border-bottom: 1px solid var(--rule); z-index: 10; }
  .deck-nav-list { display: none; }
  .deck-nav.open .deck-nav-list { display: block; }
  .deck-content { padding-top: 80px; }
}
```

## Print

If the user might print or PDF-export the deck, add a print stylesheet that shows all sections (no `.hidden`) and breaks pages between sections:

```css
@media print {
  .deck-nav { display: none; }
  .deck { display: block; }
  .deck-section.hidden { display: block !important; }
  .deck-section { page-break-after: always; }
  .deck-content { padding: 0; max-width: 100%; }
}
```

## Quick checklist before shipping a deck

- [ ] 5-8 sections, named with content-bearing titles (not "Section 02").
- [ ] Sidebar nav numerals are mono and serve as nav (not decoration).
- [ ] Active section state is visible in the nav.
- [ ] Each section has a one-sentence lede that summarizes the takeaway.
- [ ] TL;DR section near the top — reader can leave after it.
- [ ] Open questions / what-we-couldn't-answer section near the end.
- [ ] Print stylesheet works for PDF export.
- [ ] No section transitions slower than 200ms.
- [ ] Italics confined to sidebar taglines and pull quotes — never heading defaults.
