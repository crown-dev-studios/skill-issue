import test from "node:test";
import assert from "node:assert/strict";
import { callReviewer } from "../dist/reviewer.js";

test("callReviewer pipes the prompt to reviewer stdin by default", async () => {
  const result = await callReviewer("review me", "claude", {
    cwd: process.cwd(),
    commandTemplate: "cat",
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reviewer, "claude");
  assert.equal(result.command, "cat");
  if (result.ok) {
    assert.equal(result.text, "review me");
  }
});

test("callReviewer still exposes the prompt file for custom command templates", async () => {
  const result = await callReviewer("review me", "codex", {
    cwd: process.cwd(),
    commandTemplate: "cat {prompt_file}",
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reviewer, "codex");
  assert.match(result.command, /cat /);
  if (result.ok) {
    assert.equal(result.text, "review me");
  }
});

test("callReviewer reports timeout for long-running reviewer commands", async () => {
  const result = await callReviewer("review me", "codex", {
    cwd: process.cwd(),
    commandTemplate: "sleep 1",
    timeoutMs: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reviewer, "codex");
  if (!result.ok) {
    assert.match(result.error, /timed out after 50 ms/i);
    assert.match(result.command ?? "", /sleep 1/);
  }
});
