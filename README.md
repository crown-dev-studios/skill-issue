# skill-issue

First-party AI agent skills and companion CLIs for software development workflows. Built and maintained by [Crown Dev Studios](https://crown.dev).

## Install

### Claude Code

Add the marketplace and install the plugin:

```
/plugin marketplace add crown-dev-studios/skill-issue
/plugin install skill-issue@crown-dev-studios
```

All skills are auto-discovered from `skills/` and activate immediately. Each is namespaced as `skill-issue:cds-<name>` (e.g. `skill-issue:cds-planning`).

### Codex, Cursor, Gemini, and other agents

Use the open agent-skills installer (recommended — it detects your installed agents and copies each skill into the right directory):

```bash
npx skills add crown-dev-studios/skill-issue
```

Or use the registry-independent fallback script, which copies each skill into `~/.agents/skills/cds-<name>/`:

```bash
curl -fsSL https://raw.githubusercontent.com/crown-dev-studios/skill-issue/main/scripts/install.sh | bash
# or, from a local checkout:
./scripts/install.sh
```

Override the destination with `SKILL_ISSUE_DEST=/some/other/path ./scripts/install.sh`. On these hosts skills are invoked as `cds-<name>` (Codex uses `$cds-<name>`).

### npm (CLIs only)

`second-opinion` is a companion CLI published in the same package:

```bash
npx @crown-dev-studios/skill-issue second-opinion --help
```

Install globally for a direct command name:

```bash
npm install -g @crown-dev-studios/skill-issue
skill-issue --help
```

`skill-issue` is the canonical release unit; the CLIs ship from the same root package so their versions stay in sync.

## Upgrade

- **Claude Code** — enable per-marketplace auto-update once, or update manually (refresh the catalogue first, then the plugin):
  ```
  /plugin marketplace update crown-dev-studios
  /plugin update skill-issue
  ```
- **npx skills** — re-run the add command; it is idempotent and tracks the default branch (there is no version pinning on this path):
  ```bash
  npx skills add crown-dev-studios/skill-issue -y
  ```
- **Pinned / reproducible** — every release is tagged `vX.Y.Z`. Pin the marketplace in Claude Code with `crown-dev-studios/skill-issue@vX.Y.Z`, or check out that tag for the install script.

## What's in here

These are the first-party skills we use to keep our engineering standards high and our feedback loops tight.

| Skill | What it does |
|---|---|
| [cds-brainstorming](skills/cds-brainstorming/) | Clarifies what should be built before planning begins. Resolves ambiguity in the problem, outcome, or direction through structured interview and option exploration. |
| [cds-planning](skills/cds-planning/) | Creates a plan of record that serves as both spec and execution plan. Covers current state, constraints, invariants, model and API boundaries, architecture diagrams, phased execution, and proof strategy. |
| [cds-plan-review](skills/cds-plan-review/) | Challenges and strengthens plans or brainstorms before implementation. Reviews for scope, product framing, sequencing, complexity, testing, operability, error handling, and threat model. |
| [cds-architecture-review](skills/cds-architecture-review/) | Reviews plans or implementations for model integrity, service boundaries, and canonical architecture direction using SOLID principles as a lens. |
| [cds-plan-compliance](skills/cds-plan-compliance/) | Checks whether an implementation matches its plan of record. Flags deviations, missing phases, unimplemented acceptance criteria, and scope drift. |
| [cds-linear-issue-shaping](skills/cds-linear-issue-shaping/) | Converts plans of record into Linear issues with dependencies, milestones, acceptance criteria, and sequencing. |
| [cds-review-council](skills/cds-review-council/) | Runs parallel Claude + Codex code reviews, then synthesizes and ranks the feedback to surface what actually matters. |
| [cds-review-triage](skills/cds-review-triage/) | Classifies and routes review feedback before implementation. Validates findings, assigns severity (P1/P2/P3), and routes to fix now, follow-up ticket, follow-up plan, or dismiss. |
| [cds-code-simplicity](skills/cds-code-simplicity/) | Directly simplifies recent code changes — removes unnecessary complexity, defensive patterns, over-abstraction, and excess state. |
| [cds-testing-philosophy](skills/cds-testing-philosophy/) | Enforces our testing principles: what to test, how to structure tests, and when to push back on coverage theater. |
| [cds-second-opinion](skills/cds-second-opinion/) | Asks a different AI agent for a second take on the current thread. Routes to Claude from Codex and Codex from Claude. |
| [cds-agent-standup](skills/cds-agent-standup/) | Reviews past coding-agent sessions across tools and produces a morning-standup report: what shipped, what's left, and why. |
| [cds-veneer](skills/cds-veneer/) | Builds polished single-file HTML artifacts (reports, decks, code reviews, audits) from markdown or analysis using an editorial design system. |

## Development

From the repo root:

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run pack:dry-run
```

Local command entrypoints are also exposed as root scripts:

```bash
pnpm run second-opinion -- --help
```

## Packaging and release

The root `VERSION` file and `package.json` are the single source of truth. Release scripts live in `scripts/` and are exposed as `pnpm run release:*`.

Preflight (no publish) — install with frozen lockfile, build, test, and dry-run `npm pack`:

```bash
pnpm run release:preflight
```

Bump the version (updates `VERSION`, `package.json`, lockfile metadata, then commits and tags `vX.Y.Z`):

```bash
bash scripts/bump-version.sh patch         # or minor | major | 1.2.3
bash scripts/bump-version.sh patch --no-push
```

Verify the tag matches `VERSION` and `package.json`:

```bash
bash scripts/check-version.sh --require-tag
```

Publish to npm (runs preflight, pushes branch + tag, then `pnpm publish`). Requires `npm login`, a clean git tree, and the matching `vX.Y.Z` tag:

```bash
bash scripts/deploy.sh --dry-run           # preview
bash scripts/deploy.sh                     # publish
```

The `pnpm run release:*` aliases invoke the same scripts but do not forward extra flags cleanly, so call the scripts directly when passing options. `pnpm run release:preflight` remains the convenient no-arg entry point for the preflight.

Full release sequence:

```bash
bash scripts/bump-version.sh patch
bash scripts/check-version.sh --require-tag
bash scripts/deploy.sh
```

## License

MIT
