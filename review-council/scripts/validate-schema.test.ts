import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema, type ValidationError } from "./validate-schema.ts";
import type { JsonObject } from "./types.ts";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const schemasDir = resolve(scriptDir, "..", "schemas");

function loadSchema(name: string): JsonObject {
  return JSON.parse(readFileSync(resolve(schemasDir, name), "utf8")) as JsonObject;
}

function expectValid(errors: ValidationError[]): void {
  assert.equal(errors.length, 0, `expected no errors, got: ${JSON.stringify(errors)}`);
}

function expectErrors(errors: ValidationError[], minCount: number): void {
  assert.ok(errors.length >= minCount, `expected >= ${minCount} errors, got ${errors.length}: ${JSON.stringify(errors)}`);
}

function expectErrorAt(errors: ValidationError[], path: string): void {
  const found = errors.some((e) => e.path === path);
  assert.ok(found, `expected error at path "${path}", got: ${JSON.stringify(errors.map((e) => e.path))}`);
}

describe("type checks", () => {
  test("string type passes", () => {
    expectValid(validateSchema("hello", { type: "string" }));
  });

  test("string type fails on number", () => {
    expectErrors(validateSchema(42, { type: "string" }), 1);
  });

  test("integer type passes", () => {
    expectValid(validateSchema(5, { type: "integer" }));
  });

  test("integer type fails on float", () => {
    expectErrors(validateSchema(5.5, { type: "integer" }), 1);
  });

  test("array type passes", () => {
    expectValid(validateSchema([], { type: "array" }));
  });

  test("object type passes", () => {
    expectValid(validateSchema({}, { type: "object" }));
  });
});

describe("enum checks", () => {
  test("enum passes on valid value", () => {
    expectValid(validateSchema("p1", { type: "string", enum: ["p1", "p2", "p3"] }));
  });

  test("enum fails on invalid value", () => {
    expectErrors(validateSchema("p4", { type: "string", enum: ["p1", "p2", "p3"] }), 1);
  });
});

describe("minimum checks", () => {
  test("minimum passes", () => {
    expectValid(validateSchema(5, { type: "integer", minimum: 1 }));
  });

  test("minimum fails", () => {
    expectErrors(validateSchema(0, { type: "integer", minimum: 1 }), 1);
  });
});

describe("object checks", () => {
  test("required properties present", () => {
    expectValid(validateSchema(
      { name: "test", value: 1 },
      { type: "object", required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "number" } } },
    ));
  });

  test("required property missing", () => {
    const errors = validateSchema(
      { name: "test" },
      { type: "object", required: ["name", "value"] },
    );
    expectErrorAt(errors, "value");
  });

  test("additionalProperties false rejects extra keys", () => {
    const errors = validateSchema(
      { name: "test", extra: true },
      { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
    );
    expectErrorAt(errors, "extra");
  });
});

describe("array items", () => {
  test("valid array items", () => {
    expectValid(validateSchema(
      [1, 2, 3],
      { type: "array", items: { type: "number" } },
    ));
  });

  test("invalid array item", () => {
    const errors = validateSchema(
      [1, "two", 3],
      { type: "array", items: { type: "number" } },
    );
    expectErrorAt(errors, "[1]");
  });
});

describe("$ref checks", () => {
  test("$ref resolves correctly", () => {
    const schema = {
      type: "object",
      properties: {
        item: { $ref: "#/$defs/thing" },
      },
      $defs: {
        thing: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    };
    expectValid(validateSchema({ item: { id: "abc" } }, schema));
  });

  test("$ref validates nested errors", () => {
    const schema = {
      type: "object",
      properties: {
        item: { $ref: "#/$defs/thing" },
      },
      $defs: {
        thing: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    };
    const errors = validateSchema({ item: {} }, schema);
    expectErrorAt(errors, "item.id");
  });
});

describe("review-findings.schema.json", () => {
  test("valid findings document passes", () => {
    const schema = loadSchema("review-findings.schema.json");
    const doc = {
      reviewer: "claude",
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      summary: "Found one issue.",
      findings: [
        {
          id: "F001",
          title: "SQL injection",
          severity: "p1",
          confidence: "high",
          category: "security",
          description: "Unsanitized input",
          evidence: "line 42",
          recommended_fix: "Use parameterized queries",
          files: [{ path: "src/db.ts", line: 42 }],
        },
      ],
    };
    expectValid(validateSchema(doc, schema));
  });

  test("findings with missing required field fails", () => {
    const schema = loadSchema("review-findings.schema.json");
    const doc = {
      reviewer: "claude",
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      // missing: summary
      findings: [],
    };
    const errors = validateSchema(doc, schema);
    expectErrorAt(errors, "summary");
  });

  test("findings with invalid severity enum fails", () => {
    const schema = loadSchema("review-findings.schema.json");
    const doc = {
      reviewer: "claude",
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      summary: "Found one issue.",
      findings: [
        {
          id: "F001",
          title: "Test",
          severity: "critical",
          confidence: "high",
          category: "security",
          description: "desc",
          evidence: "ev",
          recommended_fix: "fix",
          files: [],
        },
      ],
    };
    const errors = validateSchema(doc, schema);
    expectErrorAt(errors, "findings[0].severity");
  });

  test("findings with extra property on file ref fails", () => {
    const schema = loadSchema("review-findings.schema.json");
    const doc = {
      reviewer: "claude",
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      summary: "Found one issue.",
      findings: [
        {
          id: "F001",
          title: "Test",
          severity: "p1",
          confidence: "high",
          category: "security",
          description: "desc",
          evidence: "ev",
          recommended_fix: "fix",
          files: [{ path: "src/db.ts", line: 42, extra: true }],
        },
      ],
    };
    const errors = validateSchema(doc, schema);
    expectErrorAt(errors, "findings[0].files[0].extra");
  });
});

describe("judge-verdict.schema.json", () => {
  test("valid verdict passes", () => {
    const schema = loadSchema("judge-verdict.schema.json");
    const doc = {
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      overall_verdict: "needs-fixes",
      summary_markdown: "Two issues.",
      confirmed_findings: [
        { title: "SQL injection", status: "confirmed", reason: "Both flagged it.", final_priority: "p1", reviewer_ids: ["claude", "codex"] },
      ],
      contested_findings: [],
      rejected_findings: [],
      todo_recommendations: [
        { title: "Fix SQL injection", priority: "p1", reason: "Security." },
      ],
    };
    expectValid(validateSchema(doc, schema));
  });

  test("verdict with invalid overall_verdict enum fails", () => {
    const schema = loadSchema("judge-verdict.schema.json");
    const doc = {
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      overall_verdict: "maybe",
      summary_markdown: "Unsure.",
      confirmed_findings: [],
      contested_findings: [],
      rejected_findings: [],
      todo_recommendations: [],
    };
    const errors = validateSchema(doc, schema);
    expectErrorAt(errors, "overall_verdict");
  });

  test("verdict with missing required fields in finding ref fails", () => {
    const schema = loadSchema("judge-verdict.schema.json");
    const doc = {
      target: "staged changes",
      generated_at: "2026-03-07T18:30:00Z",
      overall_verdict: "approve",
      summary_markdown: "All good.",
      confirmed_findings: [
        { title: "Something" },
      ],
      contested_findings: [],
      rejected_findings: [],
      todo_recommendations: [],
    };
    const errors = validateSchema(doc, schema);
    // Missing status and reason on confirmed_findings[0]
    expectErrorAt(errors, "confirmed_findings[0].status");
    expectErrorAt(errors, "confirmed_findings[0].reason");
  });
});
