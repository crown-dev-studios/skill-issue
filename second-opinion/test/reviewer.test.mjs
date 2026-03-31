import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { callReviewer } from "../dist/reviewer.js";

async function withFakeReviewerBin(name, scriptSource, run) {
  const binDir = await mkdtemp(join(tmpdir(), `second-opinion-${name}-`));
  const binaryPath = join(binDir, name);
  await writeFile(binaryPath, scriptSource, "utf8");
  await chmod(binaryPath, 0o755);

  const originalPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${originalPath}`;

  try {
    return await run({ binDir, binaryPath });
  } finally {
    process.env.PATH = originalPath;
  }
}

test("callReviewer uses the built-in Claude structured stream and returns the assistant review", async () => {
  await withFakeReviewerBin(
    "claude",
    `#!/usr/bin/env node
const { appendFileSync, writeFileSync } = require("node:fs");
(async () => {
  const argsLog = process.env.SECOND_OPINION_ARGS_LOG;
  const stdinLog = process.env.SECOND_OPINION_STDIN_LOG;
  writeFileSync(argsLog, JSON.stringify(process.argv.slice(2)));
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk.toString();
  writeFileSync(stdinLog, stdin);
  appendFileSync(process.stdout.fd, JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Structured Claude review" }],
    },
  }) + "\\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
    async ({ binDir }) => {
      const argsLog = join(binDir, "claude-args.json");
      const stdinLog = join(binDir, "claude-stdin.txt");
      process.env.SECOND_OPINION_ARGS_LOG = argsLog;
      process.env.SECOND_OPINION_STDIN_LOG = stdinLog;

      try {
        const result = await callReviewer("review me", "claude", {
          cwd: process.cwd(),
          timeoutMs: 1000,
        });

        assert.equal(result.ok, true);
        assert.equal(result.reviewer, "claude");
        assert.equal(result.command, "claude --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p");
        if (result.ok) {
          assert.equal(result.text, "Structured Claude review");
        }

        const args = JSON.parse(await readFile(argsLog, "utf8"));
        assert.deepEqual(args, [
          "--dangerously-skip-permissions",
          "--verbose",
          "--output-format",
          "stream-json",
          "--include-partial-messages",
          "-p",
        ]);
        assert.equal(await readFile(stdinLog, "utf8"), "review me");
      } finally {
        delete process.env.SECOND_OPINION_ARGS_LOG;
        delete process.env.SECOND_OPINION_STDIN_LOG;
      }
    }
  );
});

test("callReviewer uses the built-in Codex structured stream and prefers the final assistant message", async () => {
  await withFakeReviewerBin(
    "codex",
    `#!/usr/bin/env node
const { appendFileSync, writeFileSync } = require("node:fs");
(async () => {
  const argsLog = process.env.SECOND_OPINION_ARGS_LOG;
  const stdinLog = process.env.SECOND_OPINION_STDIN_LOG;
  writeFileSync(argsLog, JSON.stringify(process.argv.slice(2)));
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk.toString();
  writeFileSync(stdinLog, stdin);
  appendFileSync(process.stdout.fd, JSON.stringify({
    type: "thread.started",
    thread_id: "thread-123",
  }) + "\\n");
  appendFileSync(process.stdout.fd, JSON.stringify({
    type: "agent_message_delta",
    delta: { type: "output_text_delta", text: "partial " },
  }) + "\\n");
  appendFileSync(process.stdout.fd, JSON.stringify({
    type: "response_item",
    payload: {
      role: "assistant",
      content: [{ type: "output_text", text: "Structured Codex review" }],
    },
  }) + "\\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
    async ({ binDir }) => {
      const argsLog = join(binDir, "codex-args.json");
      const stdinLog = join(binDir, "codex-stdin.txt");
      process.env.SECOND_OPINION_ARGS_LOG = argsLog;
      process.env.SECOND_OPINION_STDIN_LOG = stdinLog;

      try {
        const result = await callReviewer("review me", "codex", {
          cwd: process.cwd(),
          timeoutMs: 1000,
        });

        assert.equal(result.ok, true);
        assert.equal(result.reviewer, "codex");
        assert.equal(result.command, "codex exec --json --dangerously-bypass-approvals-and-sandbox");
        if (result.ok) {
          assert.equal(result.text, "Structured Codex review");
        }

        const args = JSON.parse(await readFile(argsLog, "utf8"));
        assert.deepEqual(args, ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox"]);
        assert.equal(await readFile(stdinLog, "utf8"), "review me");
      } finally {
        delete process.env.SECOND_OPINION_ARGS_LOG;
        delete process.env.SECOND_OPINION_STDIN_LOG;
      }
    }
  );
});

test("callReviewer reports timeout for long-running reviewer commands", async () => {
  await withFakeReviewerBin(
    "codex",
    `#!/usr/bin/env node
setTimeout(() => {}, 1000);
`,
    async () => {
      const result = await callReviewer("review me", "codex", {
        cwd: process.cwd(),
        timeoutMs: 50,
      });

      assert.equal(result.ok, false);
      assert.equal(result.reviewer, "codex");
      if (!result.ok) {
        assert.match(result.error, /timed out after 50 ms/i);
        assert.equal(result.command, "codex exec --json --dangerously-bypass-approvals-and-sandbox");
      }
    }
  );
});

test("callReviewer fails when the reviewer exits cleanly without structured assistant output", async () => {
  await withFakeReviewerBin(
    "claude",
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "system", subtype: "init" }) + "\\n");
`,
    async () => {
      const result = await callReviewer("review me", "claude", {
        cwd: process.cwd(),
        timeoutMs: 1000,
      });

      assert.equal(result.ok, false);
      assert.equal(result.reviewer, "claude");
      if (!result.ok) {
        assert.match(result.error, /did not emit a structured assistant review/i);
      }
    }
  );
});
