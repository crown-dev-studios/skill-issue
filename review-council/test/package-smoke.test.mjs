import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const packageDir = resolve(testDir, "..");
const npmCacheDir = resolve(packageDir, ".npm-cache");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
      ...options.env,
    },
    ...options,
  });
}

function readPackMetadata(args) {
  const output = run("npm", args);
  const metadata = JSON.parse(output);
  if (!Array.isArray(metadata) || metadata.length === 0) {
    throw new Error(`Unexpected npm pack output: ${output}`);
  }
  return metadata[0];
}

test("npm pack --dry-run includes the built cli and bundled assets", { concurrency: false }, () => {
  const metadata = readPackMetadata(["pack", "--dry-run", "--json"]);
  const filePaths = new Set(metadata.files.map((entry) => entry.path));

  for (const requiredPath of [
    "dist/cli.js",
    "dist/orchestrate-review-council.js",
    "dist/render-review-html.js",
    "templates/judge.md",
    "templates/report.html",
    "templates/reviewer-export.md",
    "schemas/judge-done.schema.json",
    "schemas/judge-verdict.schema.json",
    "schemas/review-done.schema.json",
    "schemas/review-findings.schema.json",
    "references/cli-integration.md",
    "references/output-contract.md",
    "README.md",
    "SKILL.md",
  ]) {
    assert.ok(filePaths.has(requiredPath), `expected ${requiredPath} to be present in npm pack output`);
  }

  assert.ok(!filePaths.has("src/cli.ts"), "source files should not be part of the published package");
});

test("a locally installed tarball exposes review-council and writes outputs into the caller repo", { concurrency: false }, () => {
  const packMetadata = readPackMetadata(["pack", "--json"]);
  const tarballPath = resolve(packageDir, packMetadata.filename);
  const tempRoot = mkdtempSync(join(tmpdir(), "review-council-smoke-"));
  const callerDir = resolve(tempRoot, "caller-repo");
  const fixturesDir = resolve(callerDir, "fixtures");

  try {
    mkdirSync(fixturesDir, { recursive: true });
    writeFileSync(resolve(callerDir, "package.json"), `${JSON.stringify({ name: "review-council-smoke", private: true }, null, 2)}\n`);

    writeFileSync(
      resolve(fixturesDir, "fake-reviewer.cjs"),
      `const fs = require("node:fs");
const path = require("node:path");
const [stageDir, reviewer, target, reviewId, runId] = process.argv.slice(2);
fs.mkdirSync(stageDir, { recursive: true });
fs.writeFileSync(path.join(stageDir, "report.md"), "# " + reviewer + " report\\n");
fs.writeFileSync(
  path.join(stageDir, "findings.json"),
  JSON.stringify({
    review_id: reviewId,
    run_id: runId,
    reviewer,
    target,
    generated_at: "2026-03-18T00:00:00.000Z",
    summary: reviewer + " found one issue.",
    findings: [
      {
        id: reviewer + "-1",
        title: reviewer + " smoke finding",
        severity: "p2",
        confidence: "high",
        category: "correctness",
        description: "Synthetic smoke-test finding.",
        evidence: "fixture output",
        recommended_fix: "Apply the synthetic fix.",
        files: [{ path: "src/example.ts", line: 12 }]
      }
    ]
  }, null, 2) + "\\n"
);
fs.writeFileSync(
  path.join(stageDir, "done.json"),
  JSON.stringify({
    review_id: reviewId,
    run_id: runId,
    reviewer,
    status: "complete",
    completed_at: "2026-03-18T00:00:01.000Z",
    finding_count: 1
  }, null, 2) + "\\n"
);
`,
    );

    writeFileSync(
      resolve(fixturesDir, "fake-judge.cjs"),
      `const fs = require("node:fs");
const path = require("node:path");
const [stageDir, target, reviewId, runId] = process.argv.slice(2);
fs.mkdirSync(stageDir, { recursive: true });
fs.writeFileSync(path.join(stageDir, "summary.md"), "Judge summary\\n");
fs.writeFileSync(
  path.join(stageDir, "verdict.json"),
  JSON.stringify({
    review_id: reviewId,
    run_id: runId,
    target,
    generated_at: "2026-03-18T00:05:00.000Z",
    overall_verdict: "needs-fixes",
    summary_markdown: "Synthetic judge summary.",
    confirmed_findings: [
      {
        title: "claude smoke finding",
        status: "confirmed",
        reason: "Synthetic confirmation.",
        final_priority: "p2",
        reviewer_ids: ["claude", "codex"]
      }
    ],
    contested_findings: [],
    rejected_findings: [],
    todo_recommendations: []
  }, null, 2) + "\\n"
);
fs.writeFileSync(
  path.join(stageDir, "done.json"),
  JSON.stringify({
    review_id: reviewId,
    run_id: runId,
    reviewer: "judge",
    status: "complete",
    completed_at: "2026-03-18T00:05:01.000Z",
    confirmed_count: 1,
    contested_count: 0,
    rejected_count: 0
  }, null, 2) + "\\n"
);
`,
    );

    execFileSync("npm", ["install", tarballPath], {
      cwd: callerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
    });

    const cliPath = resolve(callerDir, "node_modules", ".bin", "review-council");
    assert.ok(existsSync(cliPath), "expected npm install to expose a review-council binary");

    const helpResult = spawnSync(cliPath, ["--help"], {
      cwd: callerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(helpResult.status, 0);
    assert.equal(helpResult.stdout, "");
    assert.match(helpResult.stderr, /^usage: review-council --target <target> \[options\]/m);

    const summaryOutput = execFileSync(
      cliPath,
      [
        "--target",
        "staged changes",
        "--review-id",
        "smoke-review",
        "--claude-command",
        'node ./fixtures/fake-reviewer.cjs "$CLAUDE_DIR" "claude" "staged changes" "$REVIEW_ID" "$RUN_ID"',
        "--codex-command",
        'node ./fixtures/fake-reviewer.cjs "$CODEX_DIR" "codex" "staged changes" "$REVIEW_ID" "$RUN_ID"',
        "--judge-command",
        'node ./fixtures/fake-judge.cjs "$JUDGE_DIR" "staged changes" "$REVIEW_ID" "$RUN_ID"',
      ],
      {
        cwd: callerDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const summary = JSON.parse(summaryOutput);
    const runDir = summary.run_dir;
    const resolvedRunDir = realpathSync(runDir);
    const expectedReviewsDir = realpathSync(resolve(callerDir, "docs", "reviews"));

    assert.equal(summary.review_id, "smoke-review");
    assert.equal(summary.reviewers_ok, true);
    assert.equal(summary.judge_ok, true);
    assert.ok(
      resolvedRunDir.startsWith(expectedReviewsDir),
      `expected run dir inside caller repo, got ${runDir}`,
    );
    assert.match(runDir, /docs\/reviews\/smoke-review\/runs\//);

    const runJson = JSON.parse(readFileSync(resolve(resolvedRunDir, "run.json"), "utf8"));
    assert.equal(runJson.review_id, "smoke-review");
    assert.equal(runJson.run_id, summary.run_id);
    assert.ok(
      realpathSync(runJson.skill_dir).startsWith(realpathSync(resolve(callerDir, "node_modules", "@crown-dev-studios", "review-council"))),
      `expected packaged assets to resolve from installed package, got ${runJson.skill_dir}`,
    );

    for (const requiredPath of [
      resolve(runDir, "bundle.json"),
      resolve(runDir, "index.html"),
      resolve(runDir, "judge", "summary.md"),
      resolve(runDir, "judge", "verdict.json"),
      resolve(runDir, "claude", "claude-review-export.md"),
      resolve(runDir, "codex", "codex-review-export.md"),
      resolve(runDir, "judge", "judge.md"),
    ]) {
      assert.ok(existsSync(requiredPath), `expected ${requiredPath} to exist`);
    }

    const renderedPrompt = readFileSync(resolve(runDir, "claude", "claude-review-export.md"), "utf8");
    assert.match(renderedPrompt, /staged changes/);

    const htmlOutput = readFileSync(resolve(runDir, "index.html"), "utf8");
    assert.match(htmlOutput, /Review Council/);

    const bundle = JSON.parse(readFileSync(resolve(runDir, "bundle.json"), "utf8"));
    assert.equal(bundle.review_id, "smoke-review");
    assert.equal(bundle.run_id, summary.run_id);
    assert.equal(bundle.candidate_findings.length, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(tarballPath, { force: true });
  }
});
