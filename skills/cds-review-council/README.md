# Review Council

Review Council is a skill for model-parallel code review. It runs a Claude reviewer and a Codex reviewer in parallel with selected skill references (architecture-review, testing-philosophy, plan-compliance) passed into reviewer prompts as additional review lenses, then synthesizes all findings through a judge with semantic deduplication, contradiction detection, and dependency ordering.

Use it when you want:

- model-parallel review where Claude and Codex each independently apply specialized review skills
- a judge that deduplicates across both models, detects contradictions, and orders findings by dependency
- automated self-review integrated into agentic workflows

## How It Runs

The skill is prompt-driven — the agent harness owns all process lifecycle:

- The **Claude reviewer** and the **judge** run as parallel subagents launched by the host agent (Claude Code or similar).
- The **Codex reviewer** runs as a background `codex exec --json` process, and is skipped when `codex` is not on `PATH`.
- Stage success is determined by file artifacts (`done.json` plus valid structured output), never by stdout content.

There is no orchestrator binary and nothing to build. See [SKILL.md](SKILL.md) for the full workflow.

## Requirements

- An agent harness that can launch subagents (e.g., Claude Code)
- `codex` on `PATH` for the Codex reviewer (optional)
- A Git working tree to review

## Output

Each run writes to `docs/reviews/<run-id>/`:

- `judge/summary.md` — final adjudicated review
- `judge/verdict.json` — structured verdict matching [judge-verdict.schema.json](schemas/judge-verdict.schema.json)
- `follow-ups.md` — human-readable next-step list derived from the verdict
- per-reviewer `report.md`, `findings.json`, and `done.json`

The full artifact contract lives in [references/output-contract.md](references/output-contract.md).

## Files

- [SKILL.md](SKILL.md) — the workflow
- [templates/reviewer-export.md](templates/reviewer-export.md) — model reviewer prompt template
- [templates/judge.md](templates/judge.md) — judge prompt template
- [schemas/](schemas/) — findings and verdict JSON schemas
- [references/output-contract.md](references/output-contract.md) — artifact contract
