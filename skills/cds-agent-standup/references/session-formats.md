# Session Storage Formats

How each agent persists sessions on disk, the fields you read when discovering and deep-reading
sessions, and how to add a new agent. Read this when discovery misses sessions, a project groups
oddly, or you're extending coverage.

All paths are macOS/Linux under `$HOME`. Timestamps are ISO-8601 UTC (`...Z`) unless noted.

## Claude Code
- **Path:** `~/.claude/projects/<enc-cwd>/<session-id>.jsonl` (one file per session).
  `<enc-cwd>` is the cwd with `/` -> `-` and a leading `-` (e.g. `-Users-justin-Developer-foo`).
- **Lines:** JSON objects with a `type`: `user`, `assistant`, `system`, `attachment`,
  `file-history-snapshot`, `ai-title`, `last-prompt`, `mode`, `permission-mode`.
- **Useful fields:** most records carry `cwd`, `gitBranch`, `timestamp`, `sessionId`, `version`.
  - `ai-title` -> `aiTitle` (a clean human title - the best display label).
  - `user`/`assistant` -> `message` object; assistant `message.model` is the model;
    assistant `message.content` is a block list (`text`, `tool_use`, `thinking`).
  - `tool_use` blocks have `name` + `input`. Edit/Write/MultiEdit/NotebookEdit = file edits.
- **Note:** `gitBranch` is captured per record, so mid-session `git checkout` is reflected.

## Codex
- **Path:** `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, plus
  `~/.codex/archived_sessions/`. (`~/.codex/history.jsonl` is a global prompt log, not per-session.)
- **Lines:** `{type, payload, timestamp}` where `type` is `session_meta`, `turn_context`,
  `event_msg`, or `response_item`.
  - `session_meta.payload`: `id`, `cwd`, `cli_version`, `originator`, `timestamp`.
  - `turn_context.payload`: may carry `model`/`cwd`.
  - `event_msg.payload.type`: `user_message`, `agent_message`, `task_started`, `task_complete`
    (completion signal), `patch_apply_end` (a file edit), `context_compacted`, `web_search_end`,
    `token_count`, `error`.
  - `response_item.payload.type`: `function_call`/`custom_tool_call` (tool calls),
    `function_call_output`, `reasoning` (skip), `message`.
- **Note:** no `gitBranch`; group by `cwd` (resolved to git common-dir).

## Cursor - two stores, both under `~/.cursor`
- **IDE / Composer (`cursor-ide`):** `~/.cursor/chats/<ws-hash>/<chat-uuid>/store.db` (SQLite +
  `-wal`/`-shm`). Tables: `meta` (1 row, hex-encoded JSON: agentId etc.) and `blobs(id, data)`.
  Most `data` blobs are plain UTF-8 JSON messages `{"role","content"}` (content is a string or a
  `[{type:text,text}]` list); the rest are binary message-graph blobs - skip any that don't
  `json.loads` to a dict with a `role`. The workspace path is embedded in the `user_info` system
  blob as `Workspace Path: /...`. Blobs are content-addressed, so **conversation order is
  approximate** and per-message timestamps aren't reliable - use the file mtime for activity time.
- **cursor-agent CLI (`cursor-cli`):** `~/.cursor/projects/<enc-cwd>/agent-transcripts/<uuid>/<uuid>.jsonl`
  (note the extra nested `<uuid>/` dir - globbing only `agent-transcripts/*.jsonl` misses them).
  Lines are `{role, message}`; `message` is a string or `{content:[...]}`. No per-line timestamp -
  use file mtime. `<enc-cwd>` decoding is lossy (folder names contain `-`); prefer the
  `Workspace Path:` recovered from the first user message when present.

## Pi
- **Path:** `~/.pi/agent/sessions/--<enc-cwd>--/<ts>_<uuid>.jsonl` (double-dash wrapped dir).
- **Lines:** typed JSON. First line `{"type":"session","cwd":...,"id":...,"timestamp":...}`.
  Then `model_change` (`modelId`, `provider`), `thinking_level_change`, and `message` records.
  - `message.message` is an object `{role, content:[{type:text,text}]}` (occasionally a JSON
    string - parse it). Assistant `content` may include `tool_use` blocks.

## How project grouping works
Run `git -C <cwd> rev-parse --git-common-dir` and group sessions by the resolved common `.git` dir,
so **all worktrees of one repo group together** while staying distinct rows (each keeps its own
branch/path). When the dir is gone or not a git repo, fall back to the path itself. Lossy-decoded
Cursor paths can occasionally land a session in a near-duplicate group (e.g. `delta` vs
`vet-studio-delta`) - recognize and merge those during analysis.

## Adding a new agent
The machine has ~20 agent dirs (`.amp`, `.opencode`, `.gemini`, `.copilot`, `.factory`,
`.continue`, `.kilocode`, `.roo`, ...). To add one:
1. Find its session store (usually `~/.<agent>/**` JSONL or a SQLite db) and confirm the schema.
2. Document its path, per-record shape, and the fields that carry cwd/timestamps/model/asks/signals
   in a section above, following the pattern of the existing agents.
3. Add its enumeration glob to Step 2 in SKILL.md and its resume-command pattern to Step 5.
