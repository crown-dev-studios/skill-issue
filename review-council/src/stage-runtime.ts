import { resolve } from "node:path";

export type StageName = "claude" | "codex" | "judge";
export type StageCommandId = "claude-review" | "codex-review" | "codex-judge";

export interface StageExecutionArtifacts {
  streamLog: string;
  stderrLog: string;
}

export interface StageExecution {
  commandId: StageCommandId;
  command: string;
  artifacts: StageExecutionArtifacts;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildCodexCommand(promptPath: string): string {
  return `codex exec --json --dangerously-bypass-approvals-and-sandbox "$(cat ${shellQuote(promptPath)})"`;
}

function createClaudeExecution(stageDir: string, promptOutputName: string): StageExecution {
  const promptPath = resolve(stageDir, promptOutputName);
  const streamLog = resolve(stageDir, "stream.jsonl");
  const stderrLog = resolve(stageDir, "stderr.log");

  return {
    commandId: "claude-review",
    command: `claude --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p "$(cat ${shellQuote(promptPath)})"`,
    artifacts: {
      streamLog,
      stderrLog,
    },
  };
}

function createCodexExecution(stageDir: string, promptOutputName: string, commandId: StageCommandId): StageExecution {
  const promptPath = resolve(stageDir, promptOutputName);

  return {
    commandId,
    command: buildCodexCommand(promptPath),
    artifacts: {
      streamLog: resolve(stageDir, "stream.jsonl"),
      stderrLog: resolve(stageDir, "stderr.log"),
    },
  };
}

export function createStageExecution(stageName: StageName, stageDir: string, promptOutputName: string): StageExecution {
  if (stageName === "claude") {
    return createClaudeExecution(stageDir, promptOutputName);
  }

  if (stageName === "judge") {
    return createCodexExecution(stageDir, promptOutputName, "codex-judge");
  }

  return createCodexExecution(stageDir, promptOutputName, "codex-review");
}
