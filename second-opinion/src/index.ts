#!/usr/bin/env node
/**
 * second-opinion: Get a review of your current AI conversation from another model.
 *
 * Reads session files from Claude Code (~/.claude) or Codex (~/.codex),
 * extracts the conversation, and invokes the other CLI for review.
 */

import { parseArgs } from "node:util";
import { findClaudeSession, findCodexSession } from "./sessions.js";
import { parseClaudeSession, parseCodexSession } from "./parsers.js";
import { formatConversation } from "./formatter.js";
import { buildReviewPrompt, callReviewer } from "./reviewer.js";

type Source = "claude" | "codex";

const VALID_SOURCES: readonly string[] = ["claude", "codex"];

function isSource(value: string): value is Source {
  return VALID_SOURCES.includes(value);
}

function getRuntimeSessionId(source: Source): string | undefined {
  if (source === "codex") return process.env.CODEX_THREAD_ID;
  return process.env.CLAUDE_SESSION_ID ?? process.env.CLAUDE_CODE_SESSION_ID;
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
      "extract-only": { type: "boolean", default: false },
      "no-thinking": { type: "boolean", default: false },
      "max-chars": { type: "string", default: "200000" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`second-opinion — Get a review from another AI model

Usage: second-opinion [options] [focus]

Options:
  -s, --source claude|codex    Force source (auto-detected)
  --session-id <id>            Use an explicit session/thread ID
  -r, --reviewer claude|codex  Force reviewer (defaults to opposite of source)
  -f, --focus "..."            Custom review focus
  --cwd <dir>                  Working directory for session detection
  --extract-only               Print extracted conversation without review
  --no-thinking                Exclude chain-of-thought from context
  --max-chars <n>              Max conversation chars (default: 200000)
  -h, --help                   Show this help

Examples:
  second-opinion
  second-opinion "is the database schema correct?"
  second-opinion --source claude --reviewer codex`);
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

  const maxChars = parseInt(values["max-chars"] ?? "200000", 10);
  if (Number.isNaN(maxChars) || maxChars <= 0) {
    console.error(`Invalid --max-chars: "${values["max-chars"]}". Must be a positive integer.`);
    process.exit(1);
  }

  return {
    source: values.source as Source | undefined,
    sessionId: values["session-id"],
    reviewer: values.reviewer as Source | undefined,
    focus,
    cwd: values.cwd ?? process.cwd(),
    extractOnly: values["extract-only"] ?? false,
    noThinking: values["no-thinking"] ?? false,
    maxChars,
  };
}

async function resolveSession(source: Source, cwd: string, explicitSessionId?: string) {
  const sessionId = explicitSessionId ?? getRuntimeSessionId(source);
  if (source === "claude") {
    return findClaudeSession({ cwd, sessionId });
  }
  return findCodexSession({ cwd, sessionId });
}

async function detectSource(
  cwd: string,
  explicitSessionId?: string
): Promise<{ source: Source; sessionFile: string } | null> {
  // If an explicit session ID was given, look it up in both tools
  if (explicitSessionId) {
    const claudeById = await findClaudeSession({ cwd, sessionId: explicitSessionId });
    const codexById = await findCodexSession({ cwd, sessionId: explicitSessionId });

    if (claudeById && codexById) {
      return claudeById.mtime >= codexById.mtime
        ? { source: "claude", sessionFile: claudeById.path }
        : { source: "codex", sessionFile: codexById.path };
    }
    if (claudeById) return { source: "claude", sessionFile: claudeById.path };
    if (codexById) return { source: "codex", sessionFile: codexById.path };
  }

  // Try both tools using runtime session IDs (if available) or cwd fallback.
  // resolveSession checks env vars first, then falls back to cwd-scoped lookup.
  const [claudeSession, codexSession] = await Promise.all([
    resolveSession("claude", cwd),
    resolveSession("codex", cwd),
  ]);

  if (claudeSession && codexSession) {
    return claudeSession.mtime >= codexSession.mtime
      ? { source: "claude", sessionFile: claudeSession.path }
      : { source: "codex", sessionFile: codexSession.path };
  }
  if (claudeSession) return { source: "claude", sessionFile: claudeSession.path };
  if (codexSession) return { source: "codex", sessionFile: codexSession.path };
  return null;
}

async function main() {
  const args = parseCliArgs();

  // Find session
  let source: Source;
  let sessionFile: string;

  if (args.source) {
    source = args.source;
    const session = await resolveSession(source, args.cwd, args.sessionId);
    if (!session) {
      console.error(
        args.sessionId
          ? `ERROR: Could not find ${source} session '${args.sessionId}'.`
          : `ERROR: No ${source} session files found.`
      );
      process.exit(1);
    }
    sessionFile = session.path;
  } else {
    const detected = await detectSource(args.cwd, args.sessionId);
    if (!detected) {
      console.error("ERROR: Could not find any session files.");
      console.error("Are you in an active Claude Code or Codex session?");
      process.exit(1);
    }
    source = detected.source;
    sessionFile = detected.sessionFile;
  }

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
    includeThinking: !args.noThinking,
  });

  if (args.extractOnly) {
    console.log(conversation);
    return;
  }

  // Determine reviewer
  const reviewer: Source = args.reviewer ?? (source === "claude" ? "codex" : "claude");
  console.error(`Sending to ${reviewer} for review...`);

  // Build prompt and call reviewer
  const prompt = buildReviewPrompt(conversation, args.focus);
  const result = await callReviewer(prompt, reviewer);
  if (!result.ok) {
    console.error(`ERROR: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
