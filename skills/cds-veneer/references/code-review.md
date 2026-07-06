# Code Review Template Guide

**Contents**
1. [When to use the formal code review template](#when-to-use-the-formal-code-review-template)
2. [Structure](#structure)
3. [Inline diff annotation pattern](#inline-diff-annotation-pattern)
4. [Don't reinvent the wheel](#dont-reinvent-the-wheel)
5. [Quick checklist before shipping a code review veneer](#quick-checklist-before-shipping-a-code-review-veneer)

Veneer's formal code review template (`assets/layouts/code-review.html`) exists for one specific situation: a large diff where the GitHub file-tree-alphabetical view is failing the reader. For small diffs, GitHub's UI is fine and veneer is overkill.

**The template is guidance, not a fixed mold.** The six zones and the cluster structure below show *one* good way to organize a review. They are not a rigid contract. Adapt freely:

- **Clusters are flexible.** A change might have one cluster or twelve. The same hunks can legitimately be grouped more than one way — by intent, by subsystem, by risk. Pick the grouping that tells the clearest story for *this* change; there is no required cluster count.
- **Zones are optional and reorderable.** Drop a zone that doesn't apply, add one the change needs, merge two that overlap, reorder them when the narrative wants a different sequence.
- **The structure serves the reader, not the other way around.** If following the template makes the review harder to read, the template is wrong for this change — restructure it.

## When to use the formal code review template

Use it when:

- The change touches >10 files OR introduces a meaningfully new architectural boundary.
- The change crosses concerns (e.g., a security change that also touches the data model that also affects an agent's tools).
- The PR description alone won't get a useful read because the value of the change is in the cross-file story, not any single hunk.
- You're prepping a review for a non-author reader who needs to be efficient.

Don't use it for small bug fixes, single-file changes, or routine cleanups — those belong in normal commit/PR descriptions.

## Structure

The template ships with six top-level zones in this default order — a sensible starting arrangement, not a required one (see the flexibility note above). Each maps to a `<section data-section="…">` for downstream extraction.

### 1. Verdict and orientation (`data-section="verdict"`)

The first thing the reader sees. Combines:

- **Verdict pill**: ship / hold / discuss
- **What this change does** (one paragraph, audience-aware voice)
- **What it was before** (one paragraph). Reviewers context-switch in cold; they need the diffed state described, not assumed.
- **Numbers strip**: files changed, lines added/removed, intent clusters, blockers, open questions

The "what it was before" block is non-negotiable. Reviewers context-switch in cold; they need the diff'ed state described, not assumed.

### 2. Intent clusters (`data-section="intent-clusters"`)

The core of the review. Group hunks by **what they accomplish together**, not by which file they live in. Each cluster is a `<article data-cluster="…">` and has:

- **Cluster title** (intent, written as imperative or noun phrase): "Cookie rotation in auth middleware", "Cache layer for account lookups", "Remove dead scheduled-task handler"
- **One-paragraph cluster summary** — what this cluster accomplishes and why.
- **File list** — every file the cluster touches, with a hunk count.
- **Inline annotations** — for the 2-5 most important hunks in the cluster. Use the diff annotation pattern below.
- **Cross-cluster links** — when this cluster depends on or interacts with another, surface it.

**Order of clusters** is interpretation-first: start with the cluster carrying the most semantic weight. Cleanups go last. Hunks within a cluster appear in the order a reader needs them to make sense of the cluster, not alphabetical file order.

Example cluster ordering for a typical mid-sized change:

1. Behavior change clusters (the actual point of the PR).
2. Schema or contract changes that the behavior change rides on.
3. Test additions / changes that validate the above.
4. Refactors and cleanups that were bundled in.
5. Boilerplate / config / mechanical edits.

### 3. Cross-cutting concerns (`data-section="cross-cutting"`)

Four mandatory sub-sections. Each gets its own `<section data-concern="…">`. If a concern doesn't apply, say so explicitly — don't omit it.

#### Security (`data-concern="security"`)

- Auth surfaces touched (cookies, sessions, tokens, permissions).
- Input handling on any new endpoint.
- Secret / credential management.
- Anything that could exfiltrate user data.
- For each item: "what was checked", "what could break", "what we'd recommend before shipping."

#### Architecture (`data-concern="architecture"`)

- Where the change fits in the system's mental model.
- New boundaries introduced or old ones eroded.
- Coupling changes.
- Where the change might radiate (downstream consumers of any modified contract).

#### Primitives (`data-concern="primitives"`)

- New abstractions / types / data structures introduced.
- Behavioral changes to existing primitives (signatures changed, semantics shifted).
- Whether the primitive is consistent with the codebase's existing vocabulary (naming, shape, default behavior).
- Whether the new primitive is the right level of abstraction or premature.

#### Agent-native parity (`data-concern="agent-native"`)

For agent-enabled products, any important action a user can take should have a programmatic or agent-callable equivalent.

For each user-facing capability added or changed:

- Is there an agent-callable equivalent (tool, MCP endpoint, programmatic API)?
- Does the feature degrade gracefully when invoked without a human in the loop?
- Are the inputs and outputs typed / structured enough for an agent to use them?
- If the change is internal (not user-facing), is the answer "N/A" — and is that clearly stated?

If the change adds a button without an agent-tool equivalent, flag it. If it adds a tool without a UI, that's usually fine but call it out.

### 4. Open questions (`data-section="open-questions"`)

Questions the reviewer wants the author to answer. Each is a `data-question` with:

- The question.
- The location (which cluster / file / line it concerns).
- Why it matters (what hinges on the answer).

### 5. Suggested next steps (`data-section="next-steps"`)

If the verdict is anything other than "ship clean", what specifically the author should do. Each item is actionable and small.

### 6. Hypothesis ledger / methodology (`data-section="methodology"`)

A short appendix:

- Which review personas were consulted (security, performance, etc.).
- Which questions were asked of which agents (when run via `compound-engineering:ce-code-review`).
- Confidence-gated findings — what was filtered, what survived.
- What couldn't be reviewed (areas the reviewer flagged as out of competence).

## Inline diff annotation pattern

When showing a specific hunk, surround it with veneer's diff styling rather than a raw `<pre>`. The template provides `.diff` block styles with line-level annotations as margin notes.

```html
<figure class="diff" data-file="src/auth/cookie.ts" data-cluster="cookie-rotation">
  <figcaption>
    <span class="diff-file">src/auth/cookie.ts</span>
    <span class="diff-lines">+12 −4</span>
  </figcaption>
  <pre class="diff-body"><code><span class="ln rm">- const expires = now + WEEK</span>
<span class="ln add">+ const expires = now + DAY</span>
<span class="ln add">+ const rotateAfter = now + HOUR</span></code></pre>
  <aside class="diff-annotation" data-annotation="severity-info">
    <p class="eyebrow">Note</p>
    <p>Shortens the cookie lifetime from 7d to 1d with a 1h rotation. This is the load-bearing line of the cluster — everything else either supports rotation or cleans up after it.</p>
  </aside>
</figure>
```

The annotation sits in the right margin on wide screens, stacks below on narrow. Severity pills indicate `info`, `warn`, `alert`, or `accent` (positive).

## Don't reinvent the wheel

Veneer's code review is **not** a replacement for GitHub's line-by-line review UX. Don't try to recreate inline comments, suggestions, or reactions. The veneer artifact is a **companion**: a high-level overview that frames the diff so a reviewer can land on GitHub already oriented.

Specifically:

- Don't paste the full diff. Show only the hunks that matter to the cluster's story.
- Don't try to be exhaustive. Pick the 2-5 hunks per cluster that carry weight.
- Link out to GitHub for full inline review (template includes a "View on GitHub" link slot in the verdict block).

## Quick checklist before shipping a code review veneer

- [ ] Verdict pill is set.
- [ ] "What this change does" is in audience-aware voice (not "the PR adds…", but "this change makes auth cookies rotate every hour…").
- [ ] "What it was before" paragraph is present and orients the reader cold.
- [ ] Clusters are intent-ordered, not file-ordered or alphabetical.
- [ ] All four cross-cutting concerns are addressed (security, architecture, primitives, agent-native). N/A is fine if stated.
- [ ] Inline annotations are restrained — only the hunks that matter.
- [ ] Open questions are concrete, not gestures.
- [ ] Methodology appendix names which personas reviewed.
