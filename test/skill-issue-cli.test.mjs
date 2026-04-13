import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dispatcherPath = resolve(rootDir, "bin", "skill-issue.js");

function runCli(args) {
  return spawnSync(process.execPath, [dispatcherPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

test("skill-issue help lists the available commands", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /skill-issue <command>/);
  assert.match(result.stdout, /second-opinion/);
  assert.match(result.stdout, /review-council/);
});

test("skill-issue forwards to second-opinion", () => {
  const result = runCli(["second-opinion", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: second-opinion --source claude\|codex/);
});

test("skill-issue forwards to review-council", () => {
  const result = runCli(["review-council", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /review-council --target <target>/);
});

test("skill-issue rejects unknown commands", () => {
  const result = runCli(["not-a-command"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: not-a-command/);
});

test("skill-issue --version prints the package version", () => {
  const result = runCli(["--version"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^\d+\.\d+\.\d+/);
});
