# skill-issue

First-party AI agent skills and companion CLIs for software development workflows. Built and maintained by [Crown Dev Studios](https://crown.dev).

## Install

The repo ships as one npm package with one version and multiple commands:

```bash
npx @crown-dev-studios/skill-issue second-opinion --help
npx @crown-dev-studios/skill-issue review-council --help
```

If you install it globally, you also get direct command names:

```bash
npm install -g @crown-dev-studios/skill-issue
skill-issue --help
second-opinion --help
review-council --help
```

`skill-issue` is the canonical release unit. `second-opinion` and `review-council` are published together from the same root package so their versions stay in sync.

## What's in here

These are the first-party skills we use to keep our engineering standards high and our feedback loops tight.

| Skill | What it does |
|---|---|
| [architecture-review](architecture-review/) | Reviews plans or implementations for model integrity, service boundaries, and canonical architecture direction using SOLID principles as a lens. |
| [brainstorming](brainstorming/) | Clarifies what should be built before planning begins. Resolves ambiguity in the problem, outcome, or direction through structured interview and option exploration. |
| [plan-review](plan-review/) | Challenges and strengthens plans or brainstorms before implementation. Reviews for scope, product framing, sequencing, complexity, testing, operability, error handling, and threat model. |
| [planning](planning/) | Creates a plan of record that serves as both spec and execution plan. Covers current state, constraints, invariants, model and API boundaries, architecture diagrams, phased execution, and proof strategy. |
| [testing-philosophy](testing-philosophy/) | Enforces our testing principles: what to test, how to structure tests, and when to push back on coverage theater. |
| [second-opinion](second-opinion/) | Asks a different AI agent for a second take on the current thread. Routes to Claude from Codex and Codex from Claude. |
| [linear-issue-shaping](linear-issue-shaping/) | Converts plans of record into Linear issues with dependencies, milestones, acceptance criteria, and sequencing. |
| [review-council](review-council/) | Runs parallel code reviews, then synthesizes and ranks the feedback to surface what actually matters. |
| [review-triage](review-triage/) | Classifies and routes review feedback before implementation. Validates findings, assigns severity (P1/P2/P3), and routes to fix now, follow-up ticket, follow-up plan, or dismiss. |

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
pnpm run review-council -- --help
```

## License

MIT
