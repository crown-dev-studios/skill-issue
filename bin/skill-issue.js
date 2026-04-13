#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const COMMANDS = {
  "second-opinion": resolve(rootDir, "second-opinion", "dist", "index.js"),
  "review-council": resolve(rootDir, "review-council", "dist", "cli.js"),
};

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function printHelp(stream = process.stdout) {
  stream.write(`skill-issue — unified CLI for Crown Dev Studios skills

Usage:
  skill-issue <command> [args...]
  skill-issue --version
  skill-issue --help

Commands:
  second-opinion   Review the current Claude Code or Codex thread with the other CLI
  review-council   Run model-parallel code review and render a static report

Run 'skill-issue <command> --help' for command-specific options.

Examples:
  skill-issue second-opinion --source codex --session-id "$CODEX_THREAD_ID"
  skill-issue review-council --target "staged changes" --open-html
`);
}

const [subcommand, ...args] = process.argv.slice(2);

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  printHelp();
  process.exit(0);
}

if (subcommand === "--version" || subcommand === "-v") {
  console.log(readPackageVersion());
  process.exit(0);
}

const target = COMMANDS[subcommand];
if (!target) {
  console.error(`Unknown command: ${subcommand}`);
  printHelp(process.stderr);
  process.exit(1);
}

if (!existsSync(target)) {
  console.error(`Missing built CLI for ${subcommand}: ${target}`);
  const isInstalledFromNpm = /[\\/]node_modules[\\/]/.test(rootDir);
  if (isInstalledFromNpm) {
    console.error("The package may be corrupted. Reinstall with `npm install -g @crown-dev-studios/skill-issue`.");
  } else {
    console.error("Run `pnpm run build` from the skill-issue repo first.");
  }
  process.exit(1);
}

const child = spawn(process.execPath, [target, ...args], {
  stdio: "inherit",
});

const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
const signalHandlers = forwardedSignals.map((signal) => {
  const handler = () => {
    child.kill(signal);
  };
  process.on(signal, handler);
  return [signal, handler];
});

let settled = false;
const finalize = (exitCode, childSignal) => {
  if (settled) return;
  settled = true;
  for (const [sig, handler] of signalHandlers) {
    process.off(sig, handler);
  }
  if (childSignal) {
    process.kill(process.pid, childSignal);
    return;
  }
  process.exit(exitCode ?? 1);
};

child.once("error", (error) => {
  console.error(error);
  finalize(1);
});

child.once("exit", (code, signal) => {
  finalize(code, signal);
});
