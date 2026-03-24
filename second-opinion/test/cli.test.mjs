import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

async function setMtime(filepath, mtimeMs) {
  const time = new Date(mtimeMs);
  await utimes(filepath, time, time);
}

async function writeClaudeSession(homeDir, cwd, sessionId, mtimeMs, messageText = "claude user") {
  const encodedCwd = cwd.replace(/\//g, "-");
  const filepath = join(homeDir, ".claude", "projects", encodedCwd, `${sessionId}.jsonl`);
  await mkdir(join(filepath, ".."), { recursive: true });
  await writeFile(
    filepath,
    `${JSON.stringify({
      sessionId,
      cwd,
      type: "user",
      message: { role: "user", content: messageText },
    })}\n`,
    "utf-8"
  );
  await setMtime(filepath, mtimeMs);
  return filepath;
}

async function writeCodexSession(homeDir, relativePath, sessionId, cwd, mtimeMs, items) {
  const filepath = join(homeDir, ".codex", "sessions", relativePath);
  await mkdir(join(filepath, ".."), { recursive: true });
  const lines = [
    JSON.stringify({
      timestamp: "2026-03-23T20:24:39.731Z",
      type: "session_meta",
      payload: { id: sessionId, cwd },
    }),
    ...items.map((item) => JSON.stringify(item)),
  ];
  await writeFile(filepath, `${lines.join("\n")}\n`, "utf-8");
  await setMtime(filepath, mtimeMs);
  return filepath;
}

function runCli(args, env) {
  return spawnSync(process.execPath, [resolve("dist/index.js"), ...args], {
    cwd: resolve("."),
    env: {
      ...process.env,
      CODEX_THREAD_ID: "",
      CLAUDE_SESSION_ID: "",
      CLAUDE_CODE_SESSION_ID: "",
      ...env,
    },
    encoding: "utf8",
  });
}

test("CLI requires an explicit source", { concurrency: false }, async () => {
  const result = runCli([], {});

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required --source/);
});

test("CLI requires an explicit session ID", { concurrency: false }, async () => {
  const result = runCli(["--source", "codex"], {});

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required --session-id/);
});

test("CLI extracts a Codex session when source and session ID are passed explicitly", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-cli-codex-"));
  const cwd = "/repo";

  await writeClaudeSession(homeDir, cwd, "claude-session", 200, "claude user");
  await writeCodexSession(
    homeDir,
    "2026/03/23/rollout-codex-thread.jsonl",
    "codex-thread",
    cwd,
    100,
    [
      {
        type: "response_item",
        payload: { role: "user", content: [{ type: "input_text", text: "codex user" }] },
      },
    ]
  );

  const result = runCli(["--extract-only", "--cwd", cwd, "--source", "codex", "--session-id", "codex-thread"], {
    HOME: homeDir,
  });

  assert.equal(result.status, 0);
  assert.match(result.stderr, /Source: codex/);
  assert.match(result.stdout, /codex user/);
  assert.doesNotMatch(result.stdout, /claude user/);
});

test("CLI extracts a Claude session when source and session ID are passed explicitly", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-cli-claude-"));
  const cwd = "/repo";

  await writeClaudeSession(homeDir, cwd, "claude-session", 100, "claude user");
  await writeCodexSession(
    homeDir,
    "2026/03/23/rollout-codex-thread.jsonl",
    "codex-thread",
    cwd,
    200,
    [
      {
        type: "response_item",
        payload: { role: "user", content: [{ type: "input_text", text: "codex user" }] },
      },
    ]
  );

  const result = runCli(["--extract-only", "--cwd", cwd, "--source", "claude", "--session-id", "claude-session"], {
    HOME: homeDir,
  });

  assert.equal(result.status, 0);
  assert.match(result.stderr, /Source: claude/);
  assert.match(result.stdout, /claude user/);
  assert.doesNotMatch(result.stdout, /codex user/);
});

test("CLI excludes reasoning by default and includes it only with --include-thinking", { concurrency: false }, async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "second-opinion-cli-thinking-"));
  const cwd = "/repo";

  await writeCodexSession(
    homeDir,
    "2026/03/23/rollout-thinking-thread.jsonl",
    "thinking-thread",
    cwd,
    100,
    [
      {
        type: "response_item",
        payload: { role: "user", content: [{ type: "input_text", text: "review this" }] },
      },
      {
        type: "response_item",
        payload: {
          role: "assistant",
          content: [
            { type: "output_text", text: "answer" },
            { type: "reasoning", text: "sensitive reasoning" },
          ],
        },
      },
    ]
  );

  const baseEnv = { HOME: homeDir };

  const withoutThinking = runCli(
    ["--extract-only", "--cwd", cwd, "--source", "codex", "--session-id", "thinking-thread"],
    baseEnv
  );
  assert.equal(withoutThinking.status, 0);
  assert.doesNotMatch(withoutThinking.stdout, /chain-of-thought/);
  assert.doesNotMatch(withoutThinking.stdout, /sensitive reasoning/);

  const withThinking = runCli(
    ["--extract-only", "--cwd", cwd, "--source", "codex", "--session-id", "thinking-thread", "--include-thinking"],
    baseEnv
  );
  assert.equal(withThinking.status, 0);
  assert.match(withThinking.stdout, /<chain-of-thought>/);
  assert.match(withThinking.stdout, /sensitive reasoning/);
});
