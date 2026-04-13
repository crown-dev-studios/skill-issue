import type { StageName } from "./stage-runtime.js";

export type ProgressKind =
  | "assistant"
  | "assistant_delta"
  | "tool_use"
  | "message_started"
  | "message_completed";

export interface StreamProgressEvent {
  type: "stream_progress";
  stage: StageName;
  progress_kind: ProgressKind;
  event_type: string;
  preview?: string;
  tool_name?: string;
  tool_id?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function compactText(value: string, maxLength: number = 160): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, maxLength - 1)}...`;
}

function extractTextContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const text = firstString(record.text);
    if (text) parts.push(text);
  }

  return parts.length > 0 ? compactText(parts.join(" ")) : undefined;
}

function extractEventType(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const type = record.type;
  return typeof type === "string" && type.length > 0 ? type : undefined;
}

// Populates `last_event_type` in runtime status.
export function extractObservedEventType(value: unknown): string | undefined {
  const topLevelType = extractEventType(value);
  if (!topLevelType) return undefined;

  const record = asRecord(value);
  if (topLevelType === "stream_event") {
    return extractEventType(record?.event) ?? topLevelType;
  }

  if ((topLevelType === "item.started" || topLevelType === "item.completed") && record) {
    const itemType = extractEventType(record.item);
    return itemType ? `${topLevelType}:${itemType}` : topLevelType;
  }

  return topLevelType;
}

export function extractStreamProgressEvent(
  stageName: StageName,
  value: unknown,
): StreamProgressEvent | null {
  const record = asRecord(value);
  if (!record) return null;

  const type = firstString(record.type);
  if (!type) return null;

  if (type === "assistant") {
    const message = asRecord(record.message);
    const preview = extractTextContent(message?.content);
    if (!preview) return null;
    return {
      type: "stream_progress",
      stage: stageName,
      progress_kind: "assistant",
      event_type: type,
      preview,
    };
  }

  if (type === "message_delta") {
    const preview = firstString(record.delta);
    if (!preview) return null;
    return {
      type: "stream_progress",
      stage: stageName,
      progress_kind: "assistant_delta",
      event_type: type,
      preview: compactText(preview),
    };
  }

  if (type === "item.started" || type === "item.completed") {
    const item = asRecord(record.item);
    const itemType = firstString(item?.type);

    if (itemType === "agent_message" && type === "item.completed") {
      const preview = firstString(item?.text);
      if (!preview) return null;
      return {
        type: "stream_progress",
        stage: stageName,
        progress_kind: "assistant",
        event_type: `${type}:${itemType}`,
        preview: compactText(preview),
      };
    }

    if (itemType === "command_execution" && type === "item.started") {
      const command = firstString(item?.command);
      if (!command) return null;
      return {
        type: "stream_progress",
        stage: stageName,
        progress_kind: "tool_use",
        event_type: `${type}:${itemType}`,
        tool_name: "command_execution",
        preview: compactText(command),
      };
    }

    return null;
  }

  if (type !== "stream_event") return null;

  const event = asRecord(record.event);
  const nestedType = firstString(event?.type);
  if (!nestedType) return null;

  if (nestedType === "content_block_start") {
    const block = asRecord(event?.content_block);
    if (firstString(block?.type) !== "tool_use") return null;
    return {
      type: "stream_progress",
      stage: stageName,
      progress_kind: "tool_use",
      event_type: nestedType,
      tool_name: firstString(block?.name) ?? "tool_use",
      tool_id: firstString(block?.id) ?? null,
    };
  }

  if (nestedType === "content_block_delta") {
    const delta = asRecord(event?.delta);
    const deltaType = firstString(delta?.type);
    if (deltaType !== "text_delta") return null;
    const preview = firstString(delta?.text);
    if (!preview) return null;
    return {
      type: "stream_progress",
      stage: stageName,
      progress_kind: "assistant_delta",
      event_type: deltaType,
      preview: compactText(preview),
    };
  }

  if (nestedType === "message_start" || nestedType === "message_stop") {
    return {
      type: "stream_progress",
      stage: stageName,
      progress_kind: nestedType === "message_start" ? "message_started" : "message_completed",
      event_type: nestedType,
    };
  }

  return null;
}
