import { z } from "zod";

const fileRef = z.object({
  path: z.string(),
  line: z.number().int().min(1).optional(),
}).strict();

const finding = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["p1", "p2", "p3"]),
  confidence: z.enum(["high", "medium", "low"]),
  category: z.string(),
  description: z.string(),
  evidence: z.string(),
  recommended_fix: z.string(),
  files: z.array(fileRef),
}).strict();

export const reviewFindingsSchema = z.object({
  review_id: z.string(),
  run_id: z.string(),
  reviewer: z.enum(["claude", "codex", "other"]),
  target: z.string(),
  generated_at: z.iso.datetime(),
  summary: z.string(),
  findings: z.array(finding),
}).strict();

const verdictFinding = z.object({
  title: z.string(),
  status: z.enum(["confirmed", "contested", "rejected"]),
  reason: z.string(),
  reviewer_ids: z.array(z.string()).optional(),
  final_priority: z.enum(["p1", "p2", "p3"]).optional(),
}).strict();

const todoRecommendation = z.object({
  title: z.string(),
  priority: z.enum(["p1", "p2", "p3"]),
  reason: z.string(),
}).strict();

export const judgeVerdictSchema = z.object({
  review_id: z.string(),
  run_id: z.string(),
  target: z.string(),
  generated_at: z.iso.datetime(),
  overall_verdict: z.enum(["approve", "needs-fixes", "blocked", "incomplete"]),
  summary_markdown: z.string(),
  confirmed_findings: z.array(verdictFinding),
  contested_findings: z.array(verdictFinding),
  rejected_findings: z.array(verdictFinding),
  todo_recommendations: z.array(todoRecommendation),
}).strict();

export const reviewDoneSchema = z.object({
  review_id: z.string(),
  run_id: z.string(),
  reviewer: z.enum(["claude", "codex", "other"]),
  status: z.literal("complete"),
  completed_at: z.iso.datetime(),
  finding_count: z.number().int().min(0),
}).strict();

export const judgeDoneSchema = z.object({
  review_id: z.string(),
  run_id: z.string(),
  reviewer: z.literal("judge"),
  status: z.literal("complete"),
  completed_at: z.iso.datetime(),
  confirmed_count: z.number().int().min(0),
  contested_count: z.number().int().min(0),
  rejected_count: z.number().int().min(0),
}).strict();

export type ReviewFindings = z.infer<typeof reviewFindingsSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
export type ReviewDone = z.infer<typeof reviewDoneSchema>;
export type JudgeDone = z.infer<typeof judgeDoneSchema>;
