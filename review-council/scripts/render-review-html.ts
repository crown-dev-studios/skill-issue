#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonValue, JsonObject } from "./types.ts";

interface FindingFileRef {
  path: string;
  line?: number;
}

interface Finding {
  reviewer: string;
  severity: string;
  title: string;
  confidence: string;
  files: FindingFileRef[];
}

interface VerdictFinding {
  title: string;
  status: string;
  reason: string;
  final_priority?: string;
  reviewer_ids?: string[];
}

type ArtifactStatus = "ok" | "missing" | "malformed";

interface Bundle {
  run: JsonObject;
  candidate_findings: Finding[];
  judge_verdict: JsonObject;
  status: {
    claude: JsonObject;
    codex: JsonObject;
    judge: JsonObject;
  };
  reports: {
    claude: string;
    codex: string;
    judge: string;
  };
  artifact_status: {
    claude: ArtifactStatus;
    codex: ArtifactStatus;
    judge: ArtifactStatus;
  };
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadJsonWithStatus(path: string): { data: JsonObject; status: ArtifactStatus } {
  if (!existsSync(path)) {
    return { data: {}, status: "missing" };
  }
  try {
    return { data: JSON.parse(readFileSync(path, "utf8")) as JsonObject, status: "ok" };
  } catch {
    return { data: {}, status: "malformed" };
  }
}

function loadText(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

function flattenFindings(document: JsonObject, reviewer: string): Finding[] {
  const findings = document.findings;
  if (!Array.isArray(findings)) {
    return [];
  }
  return findings
    .filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({ ...item, reviewer }) as Finding);
}

function stageStatusRow(name: string, status: JsonObject): string {
  const success = status.success === true;
  const isEmpty = Object.keys(status).length === 0;
  const state = isEmpty ? "pending" : success ? "success" : "failed";
  const label = isEmpty ? "pending" : success ? "complete" : "failed";

  const details: string[] = [];
  if (!isEmpty) {
    if (typeof status.exit_code === "number") {
      details.push(`exit ${status.exit_code}`);
    }
    if (status.timed_out === true) {
      details.push("timed out");
    }
    if (typeof status.attempts === "number" && (status.attempts as number) > 1) {
      details.push(`${status.attempts} attempts`);
    }
    if (Array.isArray(status.validation_errors) && status.validation_errors.length > 0) {
      details.push(`${status.validation_errors.length} validation error(s)`);
    }
  }

  const detailSpan = details.length > 0
    ? `<span class="status-details">${htmlEscape(details.join(" · "))}</span>`
    : "";

  return [
    `<div class="status-row status-${htmlEscape(state)}">`,
    `<strong>${htmlEscape(name)}</strong>`,
    `<span>${htmlEscape(label)}${detailSpan}</span>`,
    "</div>",
  ].join("");
}

function stderrExcerpt(stageDir: string, maxLines: number = 20): string {
  const stderrPath = resolve(stageDir, "stderr.log");
  const text = loadText(stderrPath);
  if (!text.trim()) return "";
  const lines = text.split("\n");
  const tail = lines.slice(-maxLines);
  return tail.join("\n");
}

function buildDiagnostics(runDir: string, statuses: Record<string, JsonObject>): string {
  const blocks: string[] = [];

  for (const [stage, status] of Object.entries(statuses)) {
    if (Object.keys(status).length === 0 || status.success === true) continue;

    const parts: string[] = [];
    parts.push(`<div class="diagnostic-block">`);
    parts.push(`<h3>${htmlEscape(stage)}</h3>`);

    // Validation errors
    if (Array.isArray(status.validation_errors)) {
      const errors = status.validation_errors as Array<{ path?: string; message?: string }>;
      parts.push(`<p><strong>Validation errors:</strong></p><ul>`);
      for (const err of errors) {
        const loc = err.path ? `${err.path}: ` : "";
        parts.push(`<li>${htmlEscape(`${loc}${err.message ?? "unknown"}`)}</li>`);
      }
      parts.push(`</ul>`);
    }

    // Stderr excerpt
    const stageDir = resolve(runDir, stage);
    const excerpt = stderrExcerpt(stageDir);
    if (excerpt) {
      parts.push(`<p><strong>stderr (last 20 lines):</strong></p>`);
      parts.push(`<pre class="stderr-excerpt">${htmlEscape(excerpt)}</pre>`);
    }

    // Log paths
    const stdoutLog = typeof status.stdout_log === "string" ? status.stdout_log : "";
    const stderrLog = typeof status.stderr_log === "string" ? status.stderr_log : "";
    if (stdoutLog || stderrLog) {
      parts.push(`<div class="log-paths">`);
      if (stdoutLog) parts.push(`<code>${htmlEscape(stdoutLog)}</code>`);
      if (stderrLog) parts.push(`<code>${htmlEscape(stderrLog)}</code>`);
      parts.push(`</div>`);
    }

    parts.push(`</div>`);
    blocks.push(parts.join(""));
  }

  return blocks.join("");
}

function filesLabel(files: FindingFileRef[]): string {
  if (files.length === 0) {
    return "-";
  }
  return files.map((item) => {
    if (!item.path) {
      return "?";
    }
    return item.line ? `${item.path}:${item.line}` : item.path;
  }).join(", ");
}

function candidateRow(row: Finding): string {
  const severity = String(row.severity ?? "-");
  return [
    "<tr>",
    `<td>${htmlEscape(String(row.reviewer ?? "-"))}</td>`,
    `<td><span class="severity ${htmlEscape(severity.toLowerCase())}">${htmlEscape(severity.toUpperCase())}</span></td>`,
    `<td>${htmlEscape(String(row.title ?? "-"))}</td>`,
    `<td>${htmlEscape(String(row.confidence ?? "-"))}</td>`,
    `<td>${htmlEscape(filesLabel(row.files))}</td>`,
    "</tr>",
  ].join("");
}

function verdictRows(verdict: JsonObject): string {
  const rows: string[] = [];
  const groups: Array<[string, JsonValue | undefined]> = [
    ["confirmed", verdict.confirmed_findings],
    ["contested", verdict.contested_findings],
    ["rejected", verdict.rejected_findings],
  ];

  for (const [status, value] of groups) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        continue;
      }
      const verdictItem = item as unknown as VerdictFinding;
      rows.push(
        [
          "<tr>",
          `<td>${htmlEscape(status)}</td>`,
          `<td>${htmlEscape(String(verdictItem.title ?? "-"))}</td>`,
          `<td>${htmlEscape(String(verdictItem.reason ?? "-"))}</td>`,
          `<td>${htmlEscape(String(verdictItem.final_priority ?? "-"))}</td>`,
          "</tr>",
        ].join(""),
      );
    }
  }

  if (rows.length) {
    return rows.join("");
  }
  return '<tr><td colspan="4" class="empty">No judge verdict rows yet.</td></tr>';
}

function chips(bundle: Bundle): string {
  const verdict = bundle.judge_verdict;
  const confirmed = Array.isArray(verdict.confirmed_findings) ? verdict.confirmed_findings.length : 0;
  const contested = Array.isArray(verdict.contested_findings) ? verdict.contested_findings.length : 0;
  const rejected = Array.isArray(verdict.rejected_findings) ? verdict.rejected_findings.length : 0;
  const items = [
    `Overall: ${String(verdict.overall_verdict ?? "incomplete")}`,
    `Candidate findings: ${bundle.candidate_findings.length}`,
    `Confirmed: ${confirmed}`,
    `Contested: ${contested}`,
    `Rejected: ${rejected}`,
  ];
  return items.map((item) => `<span class="chip">${htmlEscape(item)}</span>`).join("");
}

export function buildBundle(runDir: string): Bundle {
  const resolvedRunDir = resolve(runDir);
  const run = loadJsonWithStatus(resolve(resolvedRunDir, "run.json"));
  const claudeDoc = loadJsonWithStatus(resolve(resolvedRunDir, "claude", "findings.json"));
  const codexDoc = loadJsonWithStatus(resolve(resolvedRunDir, "codex", "findings.json"));
  const judgeDoc = loadJsonWithStatus(resolve(resolvedRunDir, "judge", "verdict.json"));
  return {
    run: run.data,
    candidate_findings: [
      ...flattenFindings(claudeDoc.data, "claude"),
      ...flattenFindings(codexDoc.data, "codex"),
    ],
    judge_verdict: judgeDoc.data,
    status: {
      claude: loadJsonWithStatus(resolve(resolvedRunDir, "claude", "status.json")).data,
      codex: loadJsonWithStatus(resolve(resolvedRunDir, "codex", "status.json")).data,
      judge: loadJsonWithStatus(resolve(resolvedRunDir, "judge", "status.json")).data,
    },
    reports: {
      claude: loadText(resolve(resolvedRunDir, "claude", "report.md")),
      codex: loadText(resolve(resolvedRunDir, "codex", "report.md")),
      judge: loadText(resolve(resolvedRunDir, "judge", "summary.md")),
    },
    artifact_status: {
      claude: claudeDoc.status,
      codex: codexDoc.status,
      judge: judgeDoc.status,
    },
  };
}

// HTML templates use __UPPER_CASE__ placeholders, replaced at render time.
// Markdown prompt templates use {{UPPER_CASE}} instead (see orchestrate-review-council.ts).
export function renderRunDir(runDir: string, templatePath?: string): void {
  const resolvedRunDir = resolve(runDir);
  const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const skillDir = resolve(scriptDir, "..");
  const resolvedTemplatePath = templatePath
    ? resolve(templatePath)
    : resolve(skillDir, "templates", "report.html");
  const bundle = buildBundle(resolvedRunDir);
  const template = readFileSync(resolvedTemplatePath, "utf8");
  const target = typeof bundle.run.target === "string" ? bundle.run.target : "-";
  const candidateRows = bundle.candidate_findings.length
    ? bundle.candidate_findings.map(candidateRow).join("")
    : '<tr><td colspan="5" class="empty">No candidate findings yet.</td></tr>';
  const statusRows = [
    stageStatusRow("Claude", bundle.status.claude),
    stageStatusRow("Codex", bundle.status.codex),
    stageStatusRow("Judge", bundle.status.judge),
  ].join("");

  const diagnosticsContent = buildDiagnostics(resolvedRunDir, {
    claude: bundle.status.claude,
    codex: bundle.status.codex,
    judge: bundle.status.judge,
  });
  const hasDiagnostics = diagnosticsContent.length > 0;

  const replacements: Record<string, string> = {
    "__TITLE__": "Review Council Report",
    "__HEADING__": "Review Council",
    "__META__": htmlEscape(`Target: ${target}`),
    "__CHIPS__": chips(bundle),
    "__JUDGE_SUMMARY__": htmlEscape(bundle.reports.judge || "Judge output not available yet."),
    "__STATUS_ROWS__": statusRows,
    "__DIAGNOSTICS_DISPLAY__": hasDiagnostics ? "block" : "none",
    "__DIAGNOSTICS_CONTENT__": diagnosticsContent,
    "__CANDIDATE_ROWS__": candidateRows,
    "__VERDICT_ROWS__": verdictRows(bundle.judge_verdict),
    "__CLAUDE_REPORT__": htmlEscape(bundle.reports.claude || "Claude report not available yet."),
    "__CODEX_REPORT__": htmlEscape(bundle.reports.codex || "Codex report not available yet."),
  };

  let htmlOutput = template;
  for (const [needle, value] of Object.entries(replacements)) {
    htmlOutput = htmlOutput.replaceAll(needle, value);
  }

  writeFileSync(resolve(resolvedRunDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  writeFileSync(resolve(resolvedRunDir, "index.html"), htmlOutput);
}

function main(): void {
  const [, , runDir, ...rest] = process.argv;
  if (!runDir || runDir === "--help" || runDir === "-h") {
    console.log("usage: render-review-html.ts [run_dir] [--template path]");
    process.exit(runDir ? 0 : 1);
  }

  let templatePath: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--template") {
      templatePath = rest[index + 1];
      index += 1;
    }
  }

  renderRunDir(runDir, templatePath);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main();
}
