#!/usr/bin/env node
/**
 * second-opinion: Get a review of your current AI conversation from another model.
 *
 * Reads session files from Claude Code (~/.claude) or Codex (~/.codex),
 * extracts the conversation, and invokes the other local CLI for review.
 */

import { parseArgs } from "node:util";
import { findClaudeSession, findCodexSession } from "./sessions.js";
import { parseClaudeSession, parseCodexSession } from "./parsers.js";
import { formatConversation } from "./formatter.js";
import { buildReviewPrompt, callReviewer, type Reviewer } from "./reviewer.js";

type Source = "claude" | "codex";

const VALID_SOURCES: readonly string[] = ["claude", "codex"];

function isSource(value: string): value is Source {
  return VALID_SOURCES.includes(value);
}

function parseCliArgs() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: "string", short: "s" },
      "session-id": { type: "string" },
      reviewer: { type: "string", short: "r" },
      focus: { type: "string", short: "f" },
      cwd: { type: "string" },
      "timeout-ms": { type: "string", default: "300000" },
      "extract-only": { type: "boolean", default: false },
      "include-thinking": { type: "boolean", default: false },
      "max-chars": { type: "string", default: "200000" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`second-opinion — Get a review from another AI model

Usage: second-opinion --source claude|codex --session-id <id> [options] [focus]

Options:
  -s, --source claude|codex    Source conversation to review (required)
  --session-id <id>            Session/thread ID to review (required)
  -r, --reviewer claude|codex  Force reviewer (defaults to opposite of source)
  -f, --focus "..."            Custom review focus
  --cwd <dir>                  Working directory for reviewer execution
  --timeout-ms <n>             Reviewer timeout in ms (default: 300000)
  --extract-only               Print extracted conversation without review
  --include-thinking           Include chain-of-thought in the forwarded context
  --max-chars <n>              Max conversation chars (default: 200000)
  -h, --help                   Show this help

Examples:
  second-opinion --source claude --session-id "$CLAUDE_SESSION_ID"
  second-opinion --source codex --session-id "$CODEX_THREAD_ID" "is the database schema correct?"`);
    process.exit(0);
  }

  // Positionals become the focus if --focus not set
  const focus = values.focus ?? (positionals.length ? positionals.join(" ") : undefined);

  if (values.source && !isSource(values.source)) {
    console.error(`Invalid --source: "${values.source}". Must be "claude" or "codex".`);
    process.exit(1);
  }
  if (values.reviewer && !isSource(values.reviewer)) {
    console.error(`Invalid --reviewer: "${values.reviewer}". Must be "claude" or "codex".`);
    process.exit(1);
  }
  if (!values.source) {
    console.error("Missing required --source. Pass --source claude or --source codex.");
    process.exit(1);
  }
  if (!values["session-id"]) {
    console.error("Missing required --session-id. Pass the active Claude or Codex session/thread ID explicitly.");
    process.exit(1);
  }

  const maxChars = parseInt(values["max-chars"] ?? "200000", 10);
  if (Number.isNaN(maxChars) || maxChars <= 0) {
    console.error(`Invalid --max-chars: "${values["max-chars"]}". Must be a positive integer.`);
    process.exit(1);
  }

  const timeoutMs = parseInt(values["timeout-ms"] ?? "300000", 10);
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    console.error(`Invalid --timeout-ms: "${values["timeout-ms"]}". Must be a positive integer.`);
    process.exit(1);
  }

  return {
    source: values.source as Source,
    sessionId: values["session-id"],
    reviewer: values.reviewer as Source | undefined,
    focus,
    cwd: values.cwd ?? process.cwd(),
    timeoutMs,
    extractOnly: values["extract-only"] ?? false,
    includeThinking: values["include-thinking"] ?? false,
    maxChars,
  };
}

async function resolveSession(source: Source, cwd: string, sessionId: string) {
  if (source === "claude") {
    return findClaudeSession({ cwd, sessionId });
  }
  return findCodexSession({ cwd, sessionId });
}

async function main() {
  const args = parseCliArgs();
  const source = args.source;
  const session = await resolveSession(source, args.cwd, args.sessionId);
  if (!session) {
    console.error(`ERROR: Could not find ${source} session '${args.sessionId}'.`);
    process.exit(1);
  }
  const sessionFile = session.path;

  const fileName = sessionFile.split("/").pop();
  console.error(`Source: ${source} | Session: ${fileName}`);

  // Parse session
  const messages =
    source === "claude"
      ? await parseClaudeSession(sessionFile)
      : await parseCodexSession(sessionFile);

  if (!messages.length) {
    console.error("ERROR: No messages found in session file.");
    process.exit(1);
  }

  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  console.error(`Extracted ${messages.length} messages (${userCount} user, ${assistantCount} assistant)`);

  // Format conversation
  const conversation = formatConversation(messages, {
    maxChars: args.maxChars,
    includeThinking: args.includeThinking,
  });

  if (args.extractOnly) {
    console.log(conversation);
    return;
  }

  // Determine reviewer
  const reviewer: Reviewer = args.reviewer ?? (source === "claude" ? "codex" : "claude");
  console.error(`Sending to ${reviewer} for review...`);

  // Build prompt and call reviewer
  const prompt = buildReviewPrompt(conversation, args.focus);
  const result = await callReviewer(prompt, reviewer, {
    cwd: args.cwd,
    timeoutMs: args.timeoutMs,
  });
  if (!result.ok) {
    console.error(`ERROR: ${result.error}`);
    if (result.command) {
      console.error(`Command: ${result.command}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(result.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
