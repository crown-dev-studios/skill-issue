---
name: cds-agent-standup
description: "Review past coding-agent sessions across Claude Code, Codex, Cursor (IDE + CLI), and Pi over a time window, then produce a structured markdown report plus a single-file HTML dashboard that explains what was worked on, what finished, what's left and WHY (needs review? blocked on a human? superseded by another thread? got distracted?), how parallel worktrees/directories of one project relate (overlap, sequencing, divergence, A/B experiments), and which leftover tasks are orchestratable long-runs vs need hands-on iteration. Use for a morning kickoff or catch-up: 'what did I work on yesterday/this week', 'catch me up on my projects', 'agent standup', 'summarize my coding sessions', 'what's left to finish', 'how should I start my day', 'review my agent sessions'. Default window is yesterday; supports a week or any custom range."
---

# Agent Standup

Turn raw coding-agent session logs into a morning-kickoff briefing. The user runs this to
answer one question: **"Given everything my agents and I did recently, how do I start today?"**

## Pipeline

1. Resolve the time window (default: yesterday).
2. `discover_sessions.py` -> compact inventory JSON (metadata + signals, grouped by project/worktree).
3. Select the few sessions worth a deep look -> `extract_session.py` -> skeleton files in scratch.
4. Analyze: cluster themes, classify each thread's status + WHY, map worktree relationships,
   score orchestratability, build resume commands. (See `references/analysis-rubric.md`.)
5. Write `report.json` (schema below).
6. `render_report.py` -> `~/agent-standup/<date>/report.md` + `report.html`.
7. Present a tight summary + the file paths + the top "start here" items.

Resolve a Python 3.12+ interpreter. The scripts need no other setup - each resolves its own
sibling files (via `__file__`) and searches the agents' chat directories itself, so the skill runs
from wherever it's installed. Point `SKILL` at this skill's directory (the base dir your harness
names when it loads the skill):
```bash
for py in python3.14 python3.13 python3.12 python3; do command -v "$py" >/dev/null 2>&1 && \
  "$py" -c 'import sys;exit(0 if sys.version_info>=(3,12) else 1)' && { PY="$py"; break; }; done
SKILL="<this skill's directory>"   # the base dir your harness reported on load; scripts/ sits inside it
```

## Guardrails (read before running)

- **Never read a whole session file into context.** They reach 1-7MB. Only the scripts touch
  raw transcripts; you read the compact inventory JSON and the trimmed skeletons.
- **Never reproduce tool inputs/outputs or reasoning blocks.** `extract_session.py` already
  strips them; keep them out of the report too.
- **Surface technical work, not personal content.** Sessions contain secrets, frustration,
  half-thoughts. Report the work. Secrets are auto-redacted; use `--share-safe` to also strip
  home paths/usernames when the user wants to share the HTML.
- **Today's live session is the user's current context** - don't feature it in the report.

## Step 1 - Resolve the window

| User says | Flag |
|-----------|------|
| (nothing), "yesterday", "kick off my day" | `--yesterday` (default) |
| "today", "so far today" | `--today` |
| "this week", "last few days", "past week" | `--week` |
| "last N days" | `--days N` |
| "since Monday", a date range | `--since <ISO> --until <ISO>` |

## Step 2 - Discover

```bash
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/agent-standup-XXXXXX")
"$PY" "$SKILL/scripts/discover_sessions.py" --yesterday --json "$SCRATCH/inventory.json"
```
Read `inventory.json`. It has `totals`, `projects[]` (grouped by **git common-dir**, so every
worktree of one repo lands together), and a flat `sessions[]`. Each session carries: agent,
project_label, branch/worktree, model, title, first_ask/last_ask, start/end, duration, turn &
tool counts, files_touched, `kind` (interactive/automation/review/agentic-prompt), and `signals`
(completed, ended_mid_tool, had_errors, compacted). Control-only no-op sessions are dropped.

Agents are config-driven via `--agents claude,codex,cursor,pi` (default all four). Cursor reads
both the IDE store (`~/.cursor/chats/*/store.db`) and the cursor-agent CLI transcripts.

If `totals.sessions` is 0, tell the user nothing was found in that window and offer a wider one.

## Step 3 - Deep-extract only what needs it

Most threads are clear from inventory metadata alone. Deep-extract **only** sessions that are
ambiguous or pivotal (cap ~8-10 total). Prioritize sessions where:
`signals.ended_mid_tool` or `signals.had_errors` is true; high tool_calls but unclear outcome;
the most recent session in each active project; or two worktrees whose relationship is unclear.

```bash
"$PY" "$SKILL/scripts/extract_session.py" "<session-file>" --output "$SCRATCH/<id>.skeleton.txt"
```
Read the skeletons. For a large window (>~80 sessions), dispatch a subagent per project group
with the relevant skeleton paths instead of reading them all yourself, using your harness's
subagent primitive (Claude Code: `Agent`; Codex: `spawn_agent`; Pi: `subagent` via pi-subagents;
Cursor: its task/agent primitive). If your harness has no subagent primitive, process groups inline.

## Step 4 - Analyze

Work through `references/analysis-rubric.md`. Produce, per project:
- **Theme** - one line on what this project's work is about.
- **Worktree relationships** - when a project has >1 worktree/path, classify each: primary,
  experimental-divergence, sequence, feature-branch, side-quest, abandoned. Name the A/B when
  two paths trial different directions of the same problem (e.g. `ai-message` vs `ai-message-v2`).
- **Threads** - logical units of work (may span sessions/agents). For each, assign a **status**
  and the **why** behind it (the heart of this skill): finished / in-progress / stalled /
  needs-review / blocked / superseded / abandoned - and whether it needs a human, a review, got
  abandoned for another thread, or was a distraction.
- **Orchestratability** - autonomous (clear measurable goal, low ambiguity -> set-and-forget),
  semi, or manual (needs tight iteration). Note complexity (S/M/L) and whether the goal is measurable.
- **Resume command** - how to pick the thread back up (Step 6 patterns).

## Step 5 - Write report.json

Write `$SCRATCH/report.json` with this shape (the renderer tolerates missing optional keys; omit
sections that are empty):

```json
{
  "window": {"label": "...", "start": "...", "end": "..."},
  "generated_at": "<ISO now>",
  "headline": "one-sentence TL;DR of the window - the 1-2 threads that matter most",
  "stats": {"sessions": N, "projects": N, "by_agent": {"claude": N, "codex": N}},
  "kickoff": [
    {"action": "...", "project": "...", "why": "...", "effort": "quick|deep|manual",
     "resume": "cd <path> && <agent resume cmd>"}
  ],
  "projects": [
    {"name": "...", "status": "active|blocked|winding-down|...", "theme": "...",
     "worktrees": [{"label": "main", "relationship": "primary|experimental-divergence|sequence|feature-branch|side-quest|abandoned", "note": "..."}],
     "threads": [
       {"title": "...", "status": "finished|in-progress|stalled|needs-review|blocked|superseded|abandoned",
        "why": "...", "agents": ["claude","codex"], "next_action": "...",
        "orchestratability": "autonomous|semi|manual", "complexity": "S|M|L",
        "measurable_goal": true, "resume": "cd <path> && ..."}
     ]}
  ],
  "orchestration_opportunities": [
    {"task": "...", "project": "...", "why_orchestratable": "...", "suggested_setup": "tmux / codex automation / ..."}
  ],
  "needs_attention": [{"item": "...", "project": "...", "reason": "..."}]
}
```

Order `kickoff` by what to do first. Put genuinely orchestratable, measurable, low-ambiguity work
in `orchestration_opportunities`; put human decisions / reviews / privacy calls in `needs_attention`.

### Resume command patterns (fill `resume`, always `cd` into the worktree first)
- claude: `cd <project_path> && claude --resume <session_id>`
- codex: `cd <project_path> && codex resume <session_id>`
- cursor-cli: `cd <project_path> && cursor-agent --resume <session_id>`
- cursor-ide: `open -a Cursor <project_path>` (IDE chats aren't CLI-resumable)
- pi: `cd <project_path> && pi --resume <session_id>`

The `cd` is the point - it removes "which folder was that again?". Treat exact resume flags as
best-effort (they vary by CLI version); the directory + session id are what matter.

## Step 6 - Render

```bash
OUT=~/agent-standup/$(date +%Y-%m-%d)
"$PY" "$SKILL/scripts/render_report.py" "$SCRATCH/report.json" --outdir "$OUT"
```
Add `--share-safe` if the user wants to share the HTML (redacts home paths + username).

## Step 7 - Present

Show the user: the **headline**, the **top 3 kickoff items**, a one-line-per-project status, and
the saved paths (`report.md` to read, `report.html` to open in a browser). Offer to open the HTML
(`open <path>/report.html`). Keep it short - the report is the artifact; your message is the nudge
to open it. Then clean up scratch: `rm -rf "$SCRATCH"`.

## References
- `references/session-formats.md` - on-disk layout + record schema for each agent, and how to add
  a new agent. Read when discovery misses sessions or you're extending coverage.
- `references/analysis-rubric.md` - the classification rubric for status/why, worktree
  relationships, and orchestratability. Read during Step 4.
