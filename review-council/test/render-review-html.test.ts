import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { renderRunDir, writeFollowUpsMarkdown } from "../src/render-review-html.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("renderRunDir renders markdown reports as HTML", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "review-council-render-"));
  const runDir = resolve(tempRoot, "docs", "reviews", "render-test", "runs", "20260318-test");

  try {
    mkdirSync(resolve(runDir, "claude"), { recursive: true });
    mkdirSync(resolve(runDir, "codex"), { recursive: true });
    mkdirSync(resolve(runDir, "judge"), { recursive: true });

    writeJson(resolve(runDir, "run.json"), {
      review_id: "render-test",
      run_id: "20260318-test",
      review_target: "staged changes",
    });

    writeJson(resolve(runDir, "claude", "status.json"), { success: true, exit_code: 0 });
    writeJson(resolve(runDir, "codex", "status.json"), { success: true, exit_code: 0 });
    writeJson(resolve(runDir, "judge", "status.json"), { success: true, exit_code: 0 });

    writeJson(resolve(runDir, "claude", "findings.json"), {
      findings: [],
    });
    writeJson(resolve(runDir, "codex", "findings.json"), {
      findings: [],
    });
    writeJson(resolve(runDir, "judge", "verdict.json"), {
      overall_verdict: "needs-fixes",
      confirmed_findings: [],
      contested_findings: [],
      rejected_findings: [],
      todo_recommendations: [
        {
          title: "Add regression coverage for staged changes rendering",
          priority: "p2",
          reason: "The HTML output is part of the public review flow.",
        },
      ],
      dependency_order: [
        "Add regression coverage for staged changes rendering",
      ],
    });

    writeFileSync(
      resolve(runDir, "judge", "summary.md"),
      [
        "# Judge Heading",
        "",
        "- first bullet",
        "- second bullet with `inline code`",
        "",
        "> quoted text",
        "",
      ].join("\n"),
    );

    writeFileSync(
      resolve(runDir, "codex", "report.md"),
      [
        "## Reviewer Details",
        "",
        "1. **Bold finding** with a [link](https://example.com)",
        "",
        "```ts",
        "const answer = 42;",
        "```",
        "",
        "<script>alert('xss')</script>",
      ].join("\n"),
    );

    const followUpsMarkdown = writeFollowUpsMarkdown(runDir);
    renderRunDir(runDir);

    const html = readFileSync(resolve(runDir, "index.html"), "utf8");
    assert.equal(existsSync(resolve(runDir, "follow-ups.md")), true);
    assert.match(followUpsMarkdown, /# Follow-ups/);
    assert.match(followUpsMarkdown, /\[P2\] Add regression coverage for staged changes rendering/);
    assert.match(html, /<h1>Judge Heading<\/h1>/);
    assert.match(html, /<h2>Follow-ups<\/h2>/);
    assert.match(html, /Suggested Resolution Order/);
    assert.match(html, /<ul>\s*<li>first bullet<\/li>\s*<li>second bullet with <code>inline code<\/code><\/li>\s*<\/ul>/);
    assert.match(html, /<blockquote>\s*<p>quoted text<\/p>\s*<\/blockquote>/);
    assert.match(html, /<h2>Reviewer Details<\/h2>/);
    assert.match(html, /<ol>\s*<li><strong>Bold finding<\/strong> with a <a href="https:\/\/example\.com">link<\/a><\/li>\s*<\/ol>/);
    assert.match(html, /<pre><code class="language-ts">const answer = 42;\n<\/code><\/pre>/);
    assert.match(html, /&lt;script&gt;alert\('xss'\)&lt;\/script&gt;/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
