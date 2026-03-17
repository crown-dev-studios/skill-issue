# skill-issue

AI agent skills for software development workflows. Built and maintained by [Crown Dev Studios](https://crown.dev).

## What's in here

These are first-party skills we use to keep our engineering standards high and our feedback loops tight.

| Skill | What it does |
|---|---|
| [architecture-review](architecture-review/) | Reviews plans or implementations for model integrity, service boundaries, and canonical architecture direction using SOLID principles as a lens. |
| [brainstorming](brainstorming/) | Clarifies what should be built before planning begins. Resolves ambiguity in the problem, outcome, or direction through structured interview and option exploration. |
| [plan-review](plan-review/) | Challenges and strengthens plans or brainstorms before implementation. Reviews for scope, product framing, sequencing, complexity, testing, operability, error handling, and threat model. |
| [planning](planning/) | Creates a plan of record that serves as both spec and execution plan. Covers current state, constraints, invariants, model & API boundaries, architecture diagrams, phased execution, and proof strategy. |
| [testing-philosophy](testing-philosophy/) | Enforces our testing principles — what to test, how to structure tests, and when to push back on coverage theater |
| [second-opinion](second-opinion/) | Asks a different AI agent for a second take on the current thread. Routes to Claude from Codex and Codex from Claude |
| [review-council](review-council/) | Runs parallel code reviews, then synthesizes and ranks the feedback to surface what actually matters |
| [review-triage](review-triage/) | Classifies and routes review feedback before implementation. Validates findings, assigns severity (P1/P2/P3), and routes to fix now, follow-up ticket, follow-up plan, or dismiss. |

## Getting started

Each skill lives in its own directory with a `SKILL.md` that contains everything the agent needs.

## License

MIT
