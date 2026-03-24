import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  judgeDoneSchema,
  judgeVerdictSchema,
  reviewDoneSchema,
  reviewFindingsSchema,
} from "../src/schemas.js";

function expectValid(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  const result = schema.safeParse(value);
  assert.equal(result.success, true, `expected valid, got errors`);
}

function expectInvalid(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  const result = schema.safeParse(value);
  assert.equal(result.success, false, `expected invalid, got success`);
}

const validFinding = {
  id: "F001",
  title: "SQL injection",
  severity: "p1",
  confidence: "high",
  category: "security",
  description: "Unsanitized input",
  evidence: "line 42",
  recommended_fix: "Use parameterized queries",
  files: [{ path: "src/db.ts", line: 42 }],
};

const validFindings = {
  review_id: "review-abc123",
  run_id: "20260318-abc12345",
  reviewer: "claude",
  target: "staged changes",
  generated_at: "2026-03-07T18:30:00Z",
  summary: "Found one issue.",
  findings: [validFinding],
};

const validVerdict = {
  review_id: "review-abc123",
  run_id: "20260318-abc12345",
  target: "staged changes",
  generated_at: "2026-03-07T18:30:00Z",
  overall_verdict: "needs-fixes",
  summary_markdown: "Two issues require attention.",
  confirmed_findings: [{
    title: "SQL injection",
    status: "confirmed",
    reason: "Both reviewers flagged it.",
    final_priority: "p1",
    reviewer_ids: ["claude", "codex"],
  }],
  contested_findings: [],
  rejected_findings: [],
  todo_recommendations: [],
};

describe("reviewFindingsSchema", () => {
  test("accepts valid findings", () => {
    expectValid(reviewFindingsSchema, validFindings);
  });

  test("rejects missing required field", () => {
    const { summary: _, ...incomplete } = validFindings;
    expectInvalid(reviewFindingsSchema, incomplete);
  });

  test("rejects invalid severity enum", () => {
    expectInvalid(reviewFindingsSchema, {
      ...validFindings,
      findings: [{ ...validFinding, severity: "critical" }],
    });
  });

  test("rejects extra properties on file ref", () => {
    expectInvalid(reviewFindingsSchema, {
      ...validFindings,
      findings: [{ ...validFinding, files: [{ path: "a.ts", line: 1, extra: true }] }],
    });
  });
});

describe("judgeVerdictSchema", () => {
  test("accepts valid verdict", () => {
    expectValid(judgeVerdictSchema, validVerdict);
  });

  test("rejects missing summary_markdown", () => {
    const { summary_markdown: _, ...incomplete } = validVerdict;
    expectInvalid(judgeVerdictSchema, incomplete);
  });

  test("rejects invalid priority", () => {
    expectInvalid(judgeVerdictSchema, {
      ...validVerdict,
      confirmed_findings: [{
        title: "Test",
        status: "confirmed",
        reason: "r",
        final_priority: "critical",
      }],
    });
  });
});

describe("reviewDoneSchema", () => {
  test("accepts valid done sentinel", () => {
    expectValid(reviewDoneSchema, {
      review_id: "r", run_id: "run", reviewer: "claude",
      status: "complete", completed_at: "2026-03-18T00:00:00Z", finding_count: 1,
    });
  });

  test("rejects non-complete status", () => {
    expectInvalid(reviewDoneSchema, {
      review_id: "r", run_id: "run", reviewer: "claude",
      status: "partial", completed_at: "2026-03-18T00:00:00Z", finding_count: 1,
    });
  });
});

describe("judgeDoneSchema", () => {
  test("accepts valid judge done sentinel", () => {
    expectValid(judgeDoneSchema, {
      review_id: "r", run_id: "run", reviewer: "judge",
      status: "complete", completed_at: "2026-03-18T00:00:00Z",
      confirmed_count: 1, contested_count: 0, rejected_count: 0,
    });
  });

  test("rejects non-judge reviewer", () => {
    expectInvalid(judgeDoneSchema, {
      review_id: "r", run_id: "run", reviewer: "claude",
      status: "complete", completed_at: "2026-03-18T00:00:00Z",
      confirmed_count: 1, contested_count: 0, rejected_count: 0,
    });
  });
});
