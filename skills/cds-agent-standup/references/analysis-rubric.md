# Analysis Rubric

How to turn the session inventory + skeletons into the report. The goal is always the same:
help the user see **where every thread stands and why**, so they can decide what to pick up
next. Read during Step 4.

## Contents
- Theme & thread clustering
- Status + the WHY (the core)
- Worktree / parallel-path relationships
- Orchestratability scoring
- Kickoff prioritization

## Theme & thread clustering
- A **project** is already grouped for you (by git common-dir). Give it a one-line **theme** from
  the asks and titles in it - what is this body of work *about*, in plain language.
- A **thread** is a logical unit of work that may span multiple sessions and agents. Cluster
  sessions into threads by similarity of ask/title and shared files - not 1 session = 1 thread.
  Example: three sessions titled "Design file storage...", "Understand residual risks...",
  "Simplify ID representations..." are one thread: the SQLite migration.
- Recurring `automation`-kind sessions (same daily prompt) are one thread, already orchestrated.

## Status + the WHY (the core of this skill)
Assign each thread a status, then explain the **why** - this is what the user actually wants.
Infer from the inventory `signals`, the ending of the skeleton, and cross-thread context.

| Status | Signals that suggest it | The "why" to write |
|--------|-------------------------|--------------------|
| `finished` | `completed` true; last session wraps up; a later thread builds on it | what shipped; anything to verify |
| `in-progress` | recent activity, no completion, coherent trajectory | where it stands; the immediate next step |
| `stalled` | activity then silence; last session ends mid-thought, low tool count | what stopped it - usually an undecided design question, not code |
| `needs-review` | `had_errors`; big edit session with no test confirmation; PR created | what to check before trusting it |
| `blocked` | `ended_mid_tool`; repeated failed attempts; waiting on a human decision | the specific blocker and who must clear it |
| `superseded` | a newer thread/worktree does the same thing a different way | which thread replaced it, so the user can drop this one |
| `abandoned` | started, no follow-up, and the user clearly moved to another thread | likely a distraction or dead end; safe to close |

WHY-inference cues:
- **Needs a human?** Privacy/data-sharing calls, architecture decisions, "which approach" forks,
  anything touching auth/secrets/production. Put these in `needs_attention`.
- **Got distracted?** A thread with one short session sandwiched between sustained work on another
  project, then never resumed. Say so - the user may want to reclaim or drop it.
- **No longer relevant?** Two threads converge on the same outcome; the later/cleaner one wins and
  the earlier is `superseded`. Always name the survivor.
- **`ended_mid_tool` + `had_errors`** on the day's longest session is the single strongest "pick
  this up first" signal - the agent was interrupted mid-work.

## Worktree / parallel-path relationships
When a project has >1 worktree or sibling directory, classify how they relate. This is where
users lose the plot, so be explicit and name the pair/relationship.

| Relationship | How to spot it |
|--------------|----------------|
| `primary` | `main`/`master`, or the worktree with the most/most-recent substantive work |
| `experimental-divergence` | a branch/dir trialing a different approach to the same problem (e.g. `local-first-sqlite-capture-backend` exploring an idea before it merges to `main`) |
| `A/B` (two experimental-divergences) | two siblings testing competing directions, e.g. `ai-message` vs `ai-message-v2`, `vet-studio` vs `vet-studio-delta`. State the contrast and, if visible, which is ahead |
| `sequence` | one branched off another and continues it (e.g. a `*-tenant` PR branch spun from the feature work) |
| `feature-branch` | scoped feature work meant to merge back (`scribe/soap-note-follow-up`) |
| `side-quest` | unrelated tangent that happened to run in this repo (`feat/diagnostics-skill`) |
| `abandoned` | a worktree with stale, unfinished work and newer activity elsewhere |

Detection inputs: branch names, directory basenames (numeric/`-v2`/`-beta`/`-delta` suffixes
signal experiments), timestamps (which is newer), and overlap in files/asks (high overlap +
divergent approach = A/B; high overlap + same approach = redundant, flag the duplication).

## Orchestratability scoring
The user wants to know what to **set running unattended** vs what needs **hands-on iteration**.
Score each remaining thread:

- `autonomous` (set-and-forget): clear **measurable goal** (tests pass, file generated, lint
  clean), low ambiguity, mostly mechanical. Good for a long tmux run or a scheduled automation.
  Repeated `automation`-kind threads are already here.
- `semi`: goal is clear but a human decision gates it (decide the design, *then* it's autonomous).
  Surface the decision as the unblock.
- `manual`: ambiguous, exploratory, design-heavy, or touching sensitive surfaces - needs tight
  human-in-the-loop iteration. Do not recommend orchestrating these.

Weigh: measurable goal? (biggest factor) · complexity S/M/L (size of change) · ambiguity (how
clear is "done") · blast radius (auth/data/prod -> manual regardless of size).

Put `autonomous` (and the gated-then-autonomous part of `semi`) threads into
`orchestration_opportunities` with a concrete `suggested_setup` (tmux session on a named worktree,
a Codex automation, a CI job).

## Kickoff prioritization
Order `kickoff` so the user can act top-down:
1. Unblock the highest-value gated thread (the decision that frees the most downstream work).
2. Resume interrupted/error-terminated work while it's fresh (`ended_mid_tool` + `had_errors`).
3. Review anything `needs-review` before it's trusted/merged.
4. Kick off `autonomous` long-runs so they work while the user does the manual threads.
5. Explicitly say where **nothing** is needed (finished threads, green automations) - that's a
   real answer that saves the user from re-checking.
Always attach a `resume` command that `cd`s into the right worktree (Step 6 patterns).
