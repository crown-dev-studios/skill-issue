---
name: cds-agent-standup
description: "Review past coding-agent sessions across Claude Code, Codex, Cursor (IDE + CLI), and Pi over a time window, then produce a structured markdown report plus a single-file HTML dashboard that explains what was worked on, what finished, what's left and WHY (needs review? blocked on a human? superseded by another thread? got distracted?), how parallel worktrees/directories of one project relate (overlap, sequencing, divergence, A/B experiments), and which leftover tasks are orchestratable long-runs vs need hands-on iteration. Use for a morning kickoff or catch-up: 'what did I work on yesterday/this week', 'catch me up on my projects', 'agent standup', 'summarize my coding sessions', 'what's left to finish', 'how should I start my day', 'review my agent sessions'. Default window is yesterday; supports a week or any custom range."
---

# Agent Standup

Turn raw coding-agent session logs into a morning-kickoff briefing. The user runs this to
answer one question: **"Given everything my agents and I did recently, how do I start today?"**

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

- **Read cheaply; never pull a whole session file into context.** They reach 1-7MB. Use `head`/
  `tail`/`jq` on JSONL and targeted `sqlite3` queries on Cursor's `store.db` - pull first/last
  message, title, model, timestamps, and signals, not the full transcript.
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

Sessions live at the on-disk paths in `references/session-formats.md` - one file per session for
Claude Code, Codex, Pi, and the cursor-agent CLI; a SQLite `store.db` for Cursor IDE. Find the ones
active in the window and read their metadata. You have a shell, `jq`, `sqlite3`, and `git` - navigate
however fits; the skill doesn't prescribe the commands. Hold to two things: read cheaply (first/last
message, title, model, timestamps, signals - not the whole 1-7MB file), and group sessions by repo so
every worktree lands together (see `references/session-formats.md` - "How project grouping works").

Build a small working inventory - per session: agent, project group, branch/worktree, model, title,
first/last ask, start/end, duration, turn & tool counts, files_touched, `kind`
(interactive/automation/review/agentic-prompt), and `signals` (completed, ended_mid_tool,
had_errors, compacted). Drop control-only no-op sessions. If nothing falls in the window, tell the
user and offer a wider one.

## Step 3 - Deep-read only what needs it

Most threads are clear from the inventory metadata alone. Deep-read **only** sessions that are
ambiguous or pivotal (cap ~8-10). Prioritize sessions where: `ended_mid_tool` or `had_errors` is
true; tool counts are high but the outcome is unclear; the most recent session in each active
project; or two worktrees whose relationship is unclear.

When you deep-read, pull only the conversational spine - user asks and assistant `text` replies -
and skip `tool_use`/`tool_result` payloads and reasoning/thinking blocks (per-agent record shapes
in `references/session-formats.md`). For a large window (>~80 sessions), dispatch a subagent per
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
- `references/session-formats.md` - on-disk layout + record schema for each agent, and how to add
  a new agent. The source of truth for the paths and fields you read in Steps 2-3.
- `references/analysis-rubric.md` - the classification rubric for status/why, worktree
  relationships, and orchestratability. Read during Step 4.
