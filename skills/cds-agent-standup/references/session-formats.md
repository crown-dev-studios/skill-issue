# Session Stores: Locations & Traps

The session files themselves are the source of truth for their format - sample a record and read
the shape from reality; CLIs ship weekly and schemas drift. This file only records what discovery
cannot tell you: where each store lives, and the traps that fail *silently* (missed sessions,
wrong ordering, double counting) rather than loudly.

## Known store locations (macOS/Linux, under `$HOME`)

| Agent | Store |
|-------|-------|
| Claude Code | `~/.claude/projects/<enc-cwd>/<session-id>.jsonl` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` and `~/.codex/archived_sessions/` |
| Cursor IDE | `~/.cursor/chats/<ws-hash>/<chat-uuid>/store.db` (SQLite) |
| cursor-agent CLI | `~/.cursor/projects/<enc-cwd>/agent-transcripts/<uuid>/<uuid>.jsonl` |
| Pi | `~/.pi/agent/sessions/--<enc-cwd>--/<ts>_<uuid>.jsonl` |

Other agents follow the same pattern (`~/.<agent>/**`, JSONL or SQLite) - discover them the same
way and add their location and any traps here.

## Silent-failure traps

- **cursor-agent nests one dir deeper than you expect.** Globbing `agent-transcripts/*.jsonl`
  returns fewer sessions with no error - include the extra `<uuid>/` level.
- **`~/.codex/history.jsonl` is not a session log.** It is a global prompt log; reading it as
  sessions double-counts work.
- **Cursor IDE timestamps are unreliable.** `store.db` blobs are content-addressed; per-message
  order and timestamps mislead. Use the file mtime for activity time. Blobs mix binary
  message-graph data with plain JSON - skip anything that doesn't parse to a dict with a `role`.
  The workspace path hides in the `user_info` blob as `Workspace Path: /...`.
- **cursor-agent and Pi lines carry no timestamps** - use file mtime.
- **Encoded cwd dirs decode lossily** (`/` -> `-` collides with `-` in folder names). Prefer a
  cwd recorded inside the file over one decoded from the directory name.
- **No `gitBranch` in Codex records** - group by the `cwd` recorded in `session_meta`.

## Project grouping

Run `git -C <cwd> rev-parse --git-common-dir` and group by the resolved common `.git` dir, so all
worktrees of one repo land together while each keeps its own branch/path row. Fall back to the
path when it isn't a git repo. Lossy-decoded paths can split one repo into near-duplicate groups -
merge those during analysis.
