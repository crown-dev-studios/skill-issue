import { resolve } from "node:path";

export type StageName = "claude" | "codex" | "judge";
export type StageCommandId = "claude-review" | "codex-review" | "codex-judge";

export interface StageExecutionArtifacts {
  streamLog: string;
  stderrLog: string;
  eventsLog: string;
  runtimeLog: string;
}

export interface StageExecution {
  commandId: StageCommandId;
  command: string;
  artifacts: StageExecutionArtifacts;
}

const CODEX_MODEL = "gpt-5.4";
const CODEX_REASONING_EFFORT = "xhigh";
const CLAUDE_MODEL = "claude-opus-4-6";
const CLAUDE_EFFORT = "max";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildCodexCommand(promptPath: string): string {
  const commandArgs = [
    "codex",
    "exec",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "--model",
    CODEX_MODEL,
    "-c",
    `model_reasoning_effort=${JSON.stringify(CODEX_REASONING_EFFORT)}`,
  ];
  const commandText = commandArgs.map((arg) => shellQuote(arg)).join(" ");
  return `${commandText} "$(cat ${shellQuote(promptPath)})"`;
}

function stageArtifacts(stageDir: string): StageExecutionArtifacts {
  return {
    streamLog: resolve(stageDir, "stream.jsonl"),
    stderrLog: resolve(stageDir, "stderr.log"),
    eventsLog: resolve(stageDir, "events.jsonl"),
    runtimeLog: resolve(stageDir, "runtime.json"),
  };
}

function createClaudeExecution(stageDir: string, promptOutputName: string): StageExecution {
  const promptPath = resolve(stageDir, promptOutputName);

  return {
    commandId: "claude-review",
    command: `claude --model ${shellQuote(CLAUDE_MODEL)} --effort ${shellQuote(CLAUDE_EFFORT)} --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p "$(cat ${shellQuote(promptPath)})"`,
    artifacts: stageArtifacts(stageDir),
  };
}

function createCodexExecution(
  stageDir: string,
  promptOutputName: string,
  commandId: StageCommandId,
): StageExecution {
  const promptPath = resolve(stageDir, promptOutputName);

  return {
    commandId,
    command: buildCodexCommand(promptPath),
    artifacts: stageArtifacts(stageDir),
  };
}

export function createStageExecution(
  stageName: StageName,
  stageDir: string,
  promptOutputName: string,
): StageExecution {
  if (stageName === "claude") {
    return createClaudeExecution(stageDir, promptOutputName);
  }

  if (stageName === "judge") {
    return createCodexExecution(stageDir, promptOutputName, "codex-judge");
  }

  return createCodexExecution(stageDir, promptOutputName, "codex-review");
}
