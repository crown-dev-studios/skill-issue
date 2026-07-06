---
name: cds-create-goal
description: 'Use when the user wants to turn a rough goal into a verifiable goal with an explicit definition of done - ready to run directly via /goal on Claude Code or Codex, or pasted as a prompt. Type /cds-create-goal to use.'
disable-model-invocation: true
---

# create-goal

Turn a rough goal into a **goal**: one sentence of objective plus an explicit, verifiable **definition of done** an agent can run directly - through `/goal` on Claude Code or Codex, or pasted as a prompt. The whole value lives in the done-when criteria: the checkable conditions that let the agent, and `/goal`'s evaluator, know it is finished. The goal *is* the runnable artifact; nothing separate "invokes" it.

## Steps

1. **Interrogate the objective.** State it in one sentence - the outcome, not the steps. Surface what is missing: context, constraints, and above all what "done" means. If done is fuzzy, ask up to 3 sharp questions; if you must proceed, write explicit assumptions instead of guessing.
   Done when: the objective is one sentence and at least one checkable done-when criterion exists.

2. **Decompose to understand the goal.** Break the objective into its parts - not to fan work out, but to prove the goal is understood and will stay on track. If you cannot name the parts, the goal is not understood yet. Use the parts to confirm scope is bounded and to make the definition of done collectively exhaustive: every part maps to a done-when criterion, and nothing is left implicit. This decomposition is comprehension, not orchestration.
   Done when: every part of the objective maps to a done-when criterion; no part is unaccounted for.

3. **Write the definition of done.** Fill the goal template (Reference: Goal). Make each done-when criterion observable and, where possible, machine-checkable. Mark assumptions inline. No placeholders.

4. **Run the done-when bar.** Test every criterion (Reference: Done-when bar). Tighten anything that is not observable; bound anything that could sprawl.
   Done when: every field is filled and every done-when criterion is checkable and collectively exhaustive.

5. **Emit + route.** Output the goal, then one line on how to run it for the user's runtime (Reference: Run routing). Stop there - running the goal is the framework's job, not this skill's.

## Reference: Goal

The artifact. Objective + definition of done, plus the context and running instruction an agent needs to stay anchored. Every field earns its place; an empty field is a question you skipped.

```
<goal>
<objective>One sentence. The outcome, not the steps. This is the completion contract /goal enforces.</objective>
<context>Repo, stack, key files, what has been tried, links the agent needs.</context>
<constraints>Guardrails: paths not to touch, keep tests green, token/time budget.</constraints>
<out_of_scope>What this goal must NOT do. Bounds "done" so it cannot sprawl.</out_of_scope>
<done_when>Checkable acceptance criteria, ideally machine-verifiable: tests green, p95 < 200ms, endpoint returns 200. Collectively exhaustive - meeting all of them means the goal is done, with no hidden work left.</done_when>
<verification>How the agent proves done_when: the exact commands or checks to run.</verification>
<stop_conditions>When to pause and ask instead of guessing. Maps to /goal pause, budget, or a blocker.</stop_conditions>
<decompose_as_you_go>Instruction to the executing agent: break the work into the parts identified above, do them in order (noting any that are independent), and re-check each against done_when before moving on. Stay anchored to the objective - if a step does not serve a done_when criterion, it is out of scope. This is guidance the agent follows while iterating, not a command to spawn anything.</decompose_as_you_go>
</goal>
```

## Reference: Done-when bar

A criterion passes only if it is:
- **Observable** - a person or a command can tell met from not-met.
- **Machine-checkable where possible** - a test, metric, status code, or diff beats a judgement call. `/goal`'s evaluator is only as good as this bar; the more quantitative the checks, the more reliably the agent self-verifies.
- **Collectively exhaustive** - meeting all of them means the goal is truly done, no hidden work left.
- **Bounded** - paired with out_of_scope, so "done" cannot expand mid-run.

## Reference: Run routing

The goal is one artifact; how you run it is a separate choice the user makes. Emit one line matching intent:
- **Paste as a prompt** - quick, single-turn work you direct yourself.
- **`/goal "<objective>"`** - the default for anything non-trivial. On Claude Code an evaluator checks done_when each time the agent tries to stop, until met or a turn cap you set ("stop after N tries"); on Codex the goal text is both the starting prompt and the completion criteria. Same artifact, both runtimes.
- **Parallel fan-out** - only when the user asks: hand the goal to a Claude Code workflow / `/effort ultracode`, or Codex `spawn_agent`, one branch per independent part. This is the user's call, not something this skill triggers.
