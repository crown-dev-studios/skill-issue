import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findClaudeSession, findCodexSession } from "../dist/sessions.js";
import { parseClaudeSession } from "../dist/parsers.js";

async function setMtime(filepath, mtimeMs) {
  const time = new Date(mtimeMs);
  await utimes(filepath, time, time);
}

async function writeCodexSession(homeDir, relativePath, sessionId, cwd, mtimeMs) {
  const filepath = join(homeDir, ".codex", "sessions", relativePath);
  await mkdir(join(filepath, ".."), { recursive: true });
  await writeFile(
    filepath,
    `${JSON.stringify({
      timestamp: "2026-03-09T20:24:39.731Z",
      type: "session_meta",
      payload: { id: sessionId, cwd },
    })}\n`,
    "utf-8"
  );
  await setMtime(filepath, mtimeMs);
  return filepath;
}

async function writeClaudeSession(homeDir, cwd, sessionId, mtimeMs) {
  const encodedCwd = cwd.replace(/\//g, "-");
  const filepath = join(homeDir, ".claude", "projects", encodedCwd, `${sessionId}.jsonl`);
  await mkdir(join(filepath, ".."), { recursive: true });
  await writeFile(
    filepath,
    `${JSON.stringify({
      sessionId,
      cwd,
      type: "user",
      message: { role: "user", content: "hello" },
    })}\n`,
    "utf-8"
  );
  await setMtime(filepath, mtimeMs);
  return filepath;
}

test("findCodexSession prefers explicit session ID over newer files", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-codex-id-"));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const expected = await writeCodexSession(
      homeDir,
      "2026/03/09/rollout-2026-03-09T16-24-39-target-session.jsonl",
      "target-session",
      "/repo",
      100
    );
    await writeCodexSession(
      homeDir,
      "2026/03/09/rollout-2026-03-09T16-49-37-newer-other-session.jsonl",
      "other-session",
      "/repo",
      200
    );

    const session = await findCodexSession({ cwd: "/repo", sessionId: "target-session" });
    assert.equal(session?.path, expected);
  } finally {
    process.env.HOME = previousHome;
  }
});

test("findCodexSession fallback is scoped to cwd", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-codex-cwd-"));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const expected = await writeCodexSession(
      homeDir,
      "2026/03/09/rollout-2026-03-09T16-24-39-repo-session.jsonl",
      "repo-session",
      "/repo",
      100
    );
    await writeCodexSession(
      homeDir,
      "2026/03/09/rollout-2026-03-09T16-49-37-other-session.jsonl",
      "other-session",
      "/other",
      200
    );

    const session = await findCodexSession({ cwd: "/repo" });
    assert.equal(session?.path, expected);
  } finally {
    process.env.HOME = previousHome;
  }
});

test("findClaudeSession prefers explicit session ID over newer files", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-claude-id-"));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const expected = await writeClaudeSession(homeDir, "/repo", "target-session", 100);
    await writeClaudeSession(homeDir, "/repo", "newer-session", 200);

    const session = await findClaudeSession({ cwd: "/repo", sessionId: "target-session" });
    assert.equal(session?.path, expected);
  } finally {
    process.env.HOME = previousHome;
  }
});

test("findCodexSession ignores cwd when an explicit session ID is provided", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-codex-id-any-cwd-"));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const expected = await writeCodexSession(
      homeDir,
      "2026/03/09/rollout-2026-03-09T16-24-39-target-session.jsonl",
      "target-session",
      "/repo",
      100
    );

    const session = await findCodexSession({ cwd: "/different", sessionId: "target-session" });
    assert.equal(session?.path, expected);
  } finally {
    process.env.HOME = previousHome;
  }
});

test("findClaudeSession ignores cwd when an explicit session ID is provided", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-claude-id-any-cwd-"));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const expected = await writeClaudeSession(homeDir, "/repo", "target-session", 100);

    const session = await findClaudeSession({ cwd: "/different", sessionId: "target-session" });
    assert.equal(session?.path, expected);
  } finally {
    process.env.HOME = previousHome;
  }
});

test("parseClaudeSession skips Claude local-command wrapper messages", { concurrency: false }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "second-opinion-claude-parse-"));
  const filepath = join(dir, "session.jsonl");
  await writeFile(
    filepath,
    [
      JSON.stringify({
        sessionId: "session-1",
        cwd: "/repo",
        type: "user",
        message: {
          role: "user",
          content:
            "<local-command-caveat>Caveat</local-command-caveat>",
        },
      }),
      JSON.stringify({
        sessionId: "session-1",
        cwd: "/repo",
        type: "user",
        message: {
          role: "user",
          content: "<bash-input>echo hi</bash-input>",
        },
      }),
      JSON.stringify({
        sessionId: "session-1",
        cwd: "/repo",
        type: "user",
        message: {
          role: "user",
          content: "actual user request",
        },
      }),
    ].join("\n"),
    "utf-8"
  );

  const messages = await parseClaudeSession(filepath);
  assert.deepEqual(messages, [{ role: "user", text: "actual user request" }]);
});
