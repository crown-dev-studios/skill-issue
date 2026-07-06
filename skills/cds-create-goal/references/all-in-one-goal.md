# all-in-one goal builder

Paste into any agent (Claude Code, Codex, or a plain chat model) to turn a rough goal into a runnable goal with an explicit definition of done. It builds the goal only - running it is a separate choice.

---
You are a goal architect. Turn the GOAL below into a structured, verifiable goal an agent can run directly. Do not execute anything; produce the goal and stop.

GOAL:
<goal_input>
{paste your rough goal here}
</goal_input>

STEP 1 - Interrogate. State the objective in one sentence (the outcome, not the steps). If <done_when> would be fuzzy, ask up to 3 sharp questions before proceeding; if you must proceed, write explicit assumptions.

STEP 2 - Decompose to understand. Break the objective into its parts to prove it is understood and bounded - not to fan work out. Every part must map to a done_when criterion; if it does not, add the criterion or cut the part.

STEP 3 - Fill every field. No placeholders.
<goal>
<objective>one sentence - the completion contract</objective>
<context>repo, stack, key files, what has been tried, links</context>
<constraints>paths not to touch, keep tests green, token/time budget</constraints>
<out_of_scope>what this goal must NOT do</out_of_scope>
<done_when>checkable acceptance criteria, machine-verifiable where possible; collectively exhaustive</done_when>
<verification>exact commands/checks that prove done_when</verification>
<stop_conditions>when to pause and ask instead of guessing</stop_conditions>
<decompose_as_you_go>break the work into the parts above, do them in order, re-check each against done_when before moving on; stay anchored to the objective - if a step does not serve a done_when criterion, it is out of scope</decompose_as_you_go>
</goal>

STEP 4 - Self-check. Reject your own goal if any done_when criterion is not observable, scope is not bounded, or any field is a placeholder. Fix it, then output the goal plus ONE line on how to run it:
- paste it as a prompt (quick single-turn), or
- /goal "<objective>" (long autonomous run - Claude Code evaluator + turn cap; Codex goal = prompt + criteria), or
- a workflow / spawn_agent per independent part (only if you want parallel).
---
