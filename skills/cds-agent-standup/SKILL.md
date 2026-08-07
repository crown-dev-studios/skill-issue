---
name: cds-agent-standup
description: "Review past agent-session work across Claude Code, Codex, Cursor (IDE + CLI), and Pi over a time window (default yesterday). Produces a plain-language markdown briefing plus a single-file HTML dashboard: what was worked on, what finished, what's left and WHY (needs review? blocked on a human? superseded? got distracted?), how parallel worktrees relate, and what can run unattended vs needs hands-on work. Restores the context that switching between many threads costs. Type /cds-agent-standup to use."
disable-model-invocation: true
---

# Agent Standup

Turn raw agent session logs into a plain-language briefing. The user runs this to answer one
question: **"Given everything my agents and I did recently, where does each thread stand - and
why?"** Re-deriving that by hand across many parallel threads is expensive; the report pays the
context-switching cost once, in one place, so picking any thread back up is cheap.

This skill is instructions, not machinery. You navigate the session logs with your own tools -
`find`, `jq`, `sqlite3`, `git`, and file reads - guided by `references/session-formats.md`. There
is no interpreter to resolve and no bundled program to run.

## Pipeline

1. Resolve the time window (default: yesterday).
2. **Discover** - enumerate recent sessions across the agents and pull cheap metadata into a
   working inventory, grouped by project/worktree.
3. **Deep-read** only the few sessions worth it - selectively, never whole files.
4. **Analyze** - cluster themes, classify each thread's status + WHY, map worktree relationships,
   score orchestratability, build resume commands. (See `references/analysis-rubric.md`.)
5. Organize the findings into the report structure (schema below).
6. **Write** `~/agent-standup/<date>/report.md` and a single self-contained `report.html`.
7. Present a tight summary + the file paths + the top "start here" items.

## Guardrails (read before running)

- **Accuracy first - but never raw-dump a session file into context.** Files reach 1-7MB,
  dominated by tool payloads. Read the full extent of whatever an accurate call requires - the
  entire conversational spine of a session if that's what it takes - by extracting user asks and
  assistant text with `jq`/`head`/`tail` on JSONL and targeted `sqlite3` queries on `store.db`,
  instead of loading raw files.
- **Never reproduce tool inputs/outputs or reasoning blocks.** When you deep-read a session, keep
  `tool_use`/`tool_result` payloads and thinking blocks out of your notes and out of the report.
- **Surface technical work, not personal content.** Sessions contain secrets, frustration,
  half-thoughts. Report the work, never the secrets. When the user wants to share the HTML, also
  strip home paths and usernames (`/Users/<name>` or `/home/<name>` -> `~`).
- **Today's live session is the user's current context** - don't feature it in the report.

## Step 1 - Resolve the window

| User says | Window |
|-----------|--------|
| (nothing), "yesterday", "kick off my day" | the previous calendar day (default) |
| "today", "so far today" | midnight today to now |
| "this week", "last few days", "past week" | the last 7 days |
| "last N days" | the last N days |
| "since Monday", a date range | the explicit start to end |

## Step 2 - Discover

Discover sessions from the files themselves - they are the source of truth, not any doc. Each
agent keeps a session store in its dotdir under `$HOME` (`~/.claude`, `~/.codex`, `~/.cursor`,
`~/.pi`, and any others present). Enumerate the stores, filter to files active in the window by
date/mtime, and sample a record or two per store to learn its current shape - formats drift with
weekly CLI releases, so trust what you read over what you remember. You have a shell, `jq`,
`sqlite3`, and `git` - navigate however fits; the skill doesn't prescribe the commands.
`references/session-formats.md` lists the known store locations and the traps that fail silently
(missed sessions, wrong ordering, double counting) - check it before trusting your coverage. Group
sessions by repo so every worktree lands together (git common-dir; see the reference).

**Coverage check:** an agent that is in use always writes logs. If a store you expect shows zero
sessions in the window, your discovery is wrong - widen the search before concluding the agent was
idle. When reality disagrees with the reference, update the reference.

Build a small working inventory - per session: agent, project group, branch/worktree, model, title,
first/last ask, start/end, duration, turn & tool counts, files_touched, `kind`
(interactive/automation/review/agentic-prompt), and `signals` (completed, ended_mid_tool,
had_errors, compacted). Drop control-only no-op sessions. If nothing falls in the window, tell the
user and offer a wider one.

## Step 3 - Deep-read only what needs it

Most threads are clear from the inventory metadata alone. Deep-read **only** sessions that are
ambiguous or pivotal - read until every thread's status and why are unambiguous, then stop.
Prioritize sessions where: `ended_mid_tool` or `had_errors` is
true; tool counts are high but the outcome is unclear; the most recent session in each active
project; or two worktrees whose relationship is unclear.

When you deep-read, pull the conversational spine - user asks and assistant `text` replies, over
the session's full extent so the story is accurate - and skip `tool_use`/`tool_result` payloads
and reasoning/thinking blocks. For a large window (>~80 sessions), dispatch a subagent per
project group with the relevant paths using your harness's subagent primitive (Claude Code:
`Agent`; Codex: its spawn/subagent primitive; Pi: `subagent`; Cursor: its task/agent primitive). If
your harness has no subagent primitive, process groups inline.

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
- **Resume command** - how to pick the thread back up (Step 5 patterns).

## Step 5 - Organize the findings

Structure the analysis like this - it's the shape you render from in Step 6, not a script input.
Omit sections that are empty.

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

## Step 6 - Write the report

Before writing, self-check the Step 5 structure: every thread has both a status and a why; every
kickoff item has a resume command that `cd`s into the right worktree; every claim traces back to a
session you actually inventoried or read. Fix gaps before rendering - a briefing with an
unexplained status has failed at this skill's core job.

Write two files into `~/agent-standup/<date>/` (date = the run day):
- `report.md` - the briefing in markdown, straight from the Step 5 structure.
- `report.html` - one self-contained HTML file (inline CSS/JS, no external dependencies) the user
  can open or share. Lead with the headline and top kickoff items; then one block per project with
  its threads, statuses, and the WHY; then orchestration opportunities and needs-attention.

If the user wants to share the HTML, strip home paths and usernames.

## Step 7 - Present

Show the user: the **headline**, the **top 3 kickoff items**, a one-line-per-project status, and
the saved paths (`report.md` to read, `report.html` to open in a browser). Offer to open the HTML
(`open <path>/report.html`). Keep it short - the report is the artifact; your message is the nudge
to open it.

## References
- `references/session-formats.md` - known store locations per agent and the traps that fail
  silently. The session files themselves are the source of truth for their format.
- `references/analysis-rubric.md` - the classification rubric for status/why, worktree
  relationships, and orchestratability. Read during Step 4.
