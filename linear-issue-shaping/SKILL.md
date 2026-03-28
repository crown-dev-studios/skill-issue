---
name: linear-issue-shaping
description: Convert a plan of record into Linear-ready issues with dependencies, acceptance criteria, and sequencing. Use when a reviewed plan needs to become executable work in Linear.
disable-model-invocation: true
---

# Linear Issue Shaping

## Purpose

Convert a plan of record into well-shaped Linear issues with the right granularity, sequencing, and acceptance criteria. Issues should be independently workable and traceable back to the plan.

## When To Use

- A plan of record exists and has been reviewed.
- The plan's phases or components need to become Linear issues.
- Issues need proper dependencies, milestones, and acceptance criteria.

## When Not To Use

- No plan exists yet. Use planning first.
- The plan has not been reviewed. Run plan-review first.
- The work is a single obvious task. Just create the issue directly.

## Core Principles

1. **One issue, one workable unit.** Each issue should be completable in isolation by a single agent or developer. If an issue requires context from another unfinished issue to start, it has a dependency that must be declared.
2. **Acceptance criteria from the plan, not invented.** Issue acceptance criteria come directly from the plan's phases and acceptance criteria. Do not add criteria the plan does not support.
3. **Dependencies are explicit.** If issue B cannot start until issue A is done, declare the blocked-by relation. Do not rely on issue ordering alone.
4. **Traceable to the plan.** Every issue ties back to the plan or authority it was shaped from. When that plan is a file in this repository with a concrete path, use the **Plan Reference** section (see Issue Template). When there is no repo-linked plan, state the source briefly in **Problem** instead—do not add an empty or placeholder Plan Reference section.
5. **Right-sized, not over-decomposed.** Do not split work into trivially small issues. Each issue should represent a meaningful unit of progress that can be validated.

## Linear Hierarchy

Linear provides these organizational levels. Use what fits the work.

- **Initiative** — for large bodies of work spanning multiple projects or phases. Create when the effort is substantial enough to warrant top-level tracking (e.g., "Maestro Service" not "Fix bug X"). Name initiatives durably — implementation details go in the description, not the title.
- **Project** — the container for issues. One project per body of work.
- **Milestone** — groups issues within a project by phase or layer. Use when the plan has natural groupings.
- **Issue** — the workable unit. Flat issues with blocked-by relations, not sub-issues, unless a single issue needs further breakdown.
- **Sub-issue** — use sparingly, only when a single issue is too large and needs internal decomposition.

## Workflow

1. **Read the plan in full.** Understand the phases, acceptance criteria, dependencies, and deferred work.
2. **Decide organizational structure.** Does this work warrant an initiative? How many milestones? Present the proposed structure for confirmation before creating anything.
3. **Identify issue boundaries.** Map plan phases or components to issues. Each issue should be a workable unit with clear acceptance criteria.
4. **Define the issue sequence.** Order issues by dependency. Issues with no upstream dependencies come first.
5. **Shape each issue.** Write the issue using the prescribed template. Use `--description-file` for all descriptions.
6. **Create in Linear.** Create initiative (if applicable), milestones, then issues. Add blocked-by relations after all issues exist.
7. **Verify the full set.** Confirm the issue set covers the plan completely — no gaps, no duplicates, no orphaned issues.

## Issue Template

Each issue description follows this structure.

**Plan Reference:** Include the `## Plan Reference` section only when there is a plan file **in this repository** with an actual path you can link (e.g. `docs/foo-plan.md`). If the plan lives only outside the repo (Linear doc, Notion, chat, no checked-in plan), **omit the entire Plan Reference section**—no section header, no bullets, no placeholders.

When a repo-linked plan exists, insert Plan Reference immediately after Problem, using this shape:

```markdown
## Plan Reference

- Plan: `<path to plan file in this repository>`
- Phase/Component: `<which part of the plan this implements>`
- Spec Sections: `<relevant spec sections, if applicable>`
- Reference Implementation: `<path to reference code, if applicable>`
```

Full template (Problem through Architecture Notes; insert the Plan Reference block from above only when applicable):

```markdown
## Problem

What this issue solves or implements. One paragraph.

## Scope

What is included in this issue.

## Non-Goals

What is explicitly excluded from this issue.

## Acceptance Criteria

- [ ] <criterion from the plan>
- [ ] <criterion from the plan>

## Verification

How to prove the work is correct.

## Architecture Notes

Relevant design context from the plan. Package, types, API surface.
```

## Linear CLI Reference

### Create initiative (large bodies of work only)

```bash
linear initiative create \
  --name "<initiative name>" \
  --description "<description with implementation details>" \
  --status planned

linear initiative add-project <initiative-id-or-name> <project-slug>
```

### Create milestones

```bash
linear milestone create \
  --project "<project slug>" \
  --name "<milestone name>"
```

### Create issues

```bash
cat > /tmp/issue-desc.md <<'EOF'
<issue description from template>
EOF

linear issue create \
  --title "<issue title>" \
  --description-file /tmp/issue-desc.md \
  --project "<project slug>" \
  --milestone "<milestone name>" \
  --priority <1-4> \
  --state "Todo" \
  --no-interactive
```

### Add dependencies

After all issues are created:

```bash
linear issue relation add <issue-id> blocked-by <blocking-issue-id>
```

## Constraints On This Skill

- This skill shapes and creates issues only. It must never generate implementation code.
- Issue acceptance criteria must come from the plan. Do not invent criteria.
- Use `--description-file` for all issue descriptions. Never pass markdown inline.
- Present the proposed structure (initiative, milestones, issue list) for confirmation before creating anything in Linear.
- Do not create labels. Labels are managed manually in the Linear UI.
