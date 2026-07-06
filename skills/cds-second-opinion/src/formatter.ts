import type { Message } from "./types.js";

interface FormatOptions {
  maxChars: number;
  includeThinking: boolean;
}

export function formatConversation(messages: Message[], opts: FormatOptions): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const label = msg.role === "user" ? "USER" : "ASSISTANT";
    const { text, thinking, tools } = msg;

    if (!text && !thinking && !tools?.length) continue;

    let part = `--- ${label} ---\n`;

    if (text) part += text + "\n";

    if (opts.includeThinking && thinking) {
      let t = thinking;
      if (t.length > 3000) {
        t = t.slice(0, 1500) + "\n[...thinking truncated...]\n" + t.slice(-1500);
      }
      part += `\n<chain-of-thought>\n${t}\n</chain-of-thought>\n`;
    }

    if (tools?.length) {
      part += `\n[Tools used: ${tools.join(", ")}]\n`;
    }

    parts.push(part);
  }

  let full = parts.join("\n");

  if (full.length > opts.maxChars) {
    // Keep first 25% (original task context) and last 55% (recent work)
    const firstCut = Math.floor(opts.maxChars * 0.25);
    const lastCut = Math.floor(opts.maxChars * 0.55);

    const firstPart = full.slice(0, firstCut);
    const lastPart = full.slice(-lastCut);

    full =
      firstPart +
      "\n\n[... CONVERSATION TRUNCATED — middle portion omitted to fit context window ...]\n\n" +
      lastPart;
  }

  return full;
}
