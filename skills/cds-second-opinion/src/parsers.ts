import { readFile } from "node:fs/promises";
import type { Message } from "./types.js";

// --- Shared helpers ---

function extractText(content: unknown, source: "claude" | "codex"): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        texts.push(block);
      } else if (block && typeof block === "object") {
        const b = block as Record<string, unknown>;
        if (source === "claude" && b.type === "text") {
          texts.push(String(b.text ?? ""));
        } else if (source === "codex" && ["input_text", "text", "output_text"].includes(String(b.type))) {
          texts.push(String(b.text ?? ""));
        }
      }
    }
    return texts.join("\n");
  }

  return "";
}

function stripSystemTags(text: string): string {
  const lines: string[] = [];
  let depth = 0;
  for (const line of text.split("\n")) {
    if (line.includes("<system-reminder>")) { depth++; continue; }
    if (line.includes("</system-reminder>")) { depth--; continue; }
    if (depth > 0) continue;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

function isClaudeLocalCommandWrapper(text: string): boolean {
  return /^<(local-command-(caveat|stdout|stderr)|bash-(input|stdout|stderr))>/.test(text);
}

function summarizeTool(name: string, input: Record<string, unknown>): string {
  if (["Read", "Glob", "Grep"].includes(name)) {
    const target = input.file_path ?? input.pattern ?? "";
    return target ? `${name}(${target})` : name;
  }
  if (name === "Bash") {
    const cmd = String(input.command ?? "").slice(0, 80);
    return `Bash(${cmd})`;
  }
  if (["Edit", "Write"].includes(name) && input.file_path) {
    return `${name}(${input.file_path})`;
  }
  if (name === "WebSearch" && input.query) {
    return `WebSearch(${String(input.query).slice(0, 60)})`;
  }
  return name;
}

// --- Claude Code parser ---

export async function parseClaudeSession(filepath: string): Promise<Message[]> {
  const raw = await readFile(filepath, "utf-8");
  const messages: Message[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const entryType = entry.type as string | undefined;
    if (entryType === "progress" || entryType === "file-history-snapshot") continue;
    if (entry.isSidechain) continue;

    const msg = entry.message as Record<string, unknown> | undefined;
    if (!msg) continue;
    const role = msg.role as string | undefined;

    if (role === "user") {
      let text = extractText(msg.content, "claude");
      text = stripSystemTags(text);

      // Skip skill injection prompts
      if (text.startsWith("Base directory for this skill:")) continue;
      if (isClaudeLocalCommandWrapper(text)) continue;

      // Clean up command markers
      if (text.includes("<command-message>") || text.includes("<command-name>")) {
        const commandName = text.match(/<command-name>(.*?)<\/command-name>/s)?.[1];
        const commandMessage = text.match(/<command-message>(.*?)<\/command-message>/s)?.[1];
        const args = text.match(/<command-args>(.*?)<\/command-args>/s)?.[1];
        text = `${commandName ?? commandMessage ?? "command"} ${args ?? ""}`.trim();
      }

      if (text.trim()) {
        messages.push({ role: "user", text: text.trim() });
      }
    } else if (role === "assistant") {
      const content = msg.content;
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const toolUses: string[] = [];

      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          const btype = b.type as string;

          if (btype === "text") {
            textParts.push(String(b.text ?? ""));
          } else if (btype === "thinking") {
            const thinking = String(b.thinking ?? "");
            if (thinking.trim()) thinkingParts.push(thinking);
          } else if (btype === "tool_use") {
            const name = String(b.name ?? "unknown");
            const input = (b.input as Record<string, unknown>) ?? {};
            toolUses.push(summarizeTool(name, input));
          }
        }
      } else if (typeof content === "string") {
        textParts.push(content);
      }

      const msgEntry: Message = { role: "assistant", text: textParts.join("\n") };
      if (thinkingParts.length) msgEntry.thinking = thinkingParts.join("\n---\n");
      if (toolUses.length) msgEntry.tools = toolUses;

      if (msgEntry.text.trim() || thinkingParts.length || toolUses.length) {
        messages.push(msgEntry);
      }
    }
  }

  return messages;
}

// --- Codex parser ---

const CODEX_SKIP_PREFIXES = [
  "<permissions",
  "<collaboration_mode",
  "# AGENTS.md",
  "<user_shell_command>",
];

export async function parseCodexSession(filepath: string): Promise<Message[]> {
  const raw = await readFile(filepath, "utf-8");
  const messages: Message[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "response_item") continue;

    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload) continue;

    const role = payload.role as string;
    const content = payload.content;

    if (role === "user") {
      let text = extractText(content, "codex");
      text = stripSystemTags(text);

      if (CODEX_SKIP_PREFIXES.some((p) => text.startsWith(p))) continue;
      if (text.trim()) {
        messages.push({ role: "user", text: text.trim() });
      }
    } else if (role === "assistant") {
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const toolUses: string[] = [];

      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          const btype = b.type as string;

          if (btype === "output_text" || btype === "text") {
            textParts.push(String(b.text ?? ""));
          } else if (btype === "reasoning") {
            const r = String(b.text ?? "");
            if (r.trim()) thinkingParts.push(r);
          } else if (btype === "function_call") {
            const name = String(b.name ?? "unknown");
            let args = String(b.arguments ?? "");
            if (args.length > 80) args = args.slice(0, 80) + "...";
            toolUses.push(args ? `${name}(${args})` : name);
          }
        }
      } else if (typeof content === "string") {
        textParts.push(content);
      }

      const msgEntry: Message = { role: "assistant", text: textParts.join("\n") };
      if (thinkingParts.length) msgEntry.thinking = thinkingParts.join("\n---\n");
      if (toolUses.length) msgEntry.tools = toolUses;

      if (msgEntry.text.trim() || thinkingParts.length || toolUses.length) {
        messages.push(msgEntry);
      }
    }
  }

  return messages;
}
