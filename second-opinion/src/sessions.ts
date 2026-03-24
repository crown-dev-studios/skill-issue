import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import type { SessionInfo } from "./types.js";

interface FindSessionOptions {
  cwd?: string;
  sessionId?: string;
}

interface SessionMeta {
  cwd?: string;
  sessionId?: string;
}

function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

async function readJsonlMetadata<T>(
  filepath: string,
  extract: (entry: Record<string, unknown>) => T | null
): Promise<T | null> {
  const rl = createInterface({
    input: createReadStream(filepath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const result = extract(entry);
      if (result) return result;
    }
  } catch {
    return null;
  } finally {
    rl.close();
  }

  return null;
}

async function readClaudeSessionMeta(filepath: string): Promise<SessionMeta | null> {
  return readJsonlMetadata(filepath, (entry) => {
    const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : undefined;
    const cwd = typeof entry.cwd === "string" ? entry.cwd : undefined;
    if (!sessionId && !cwd) return null;
    return { sessionId, cwd };
  });
}

async function readCodexSessionMeta(filepath: string): Promise<SessionMeta | null> {
  return readJsonlMetadata(filepath, (entry) => {
    if (entry.type !== "session_meta") return null;

    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload) return null;

    const sessionId = typeof payload.id === "string" ? payload.id : undefined;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
    if (!sessionId && !cwd) return null;
    return { sessionId, cwd };
  });
}

async function getSessionInfo(filepath: string): Promise<SessionInfo | null> {
  try {
    const fileStat = await stat(filepath);
    return { path: filepath, mtime: fileStat.mtimeMs };
  } catch {
    return null;
  }
}

async function findNewestJsonl(
  dir: string,
  matches?: (filepath: string, entryName: string) => Promise<boolean>
): Promise<SessionInfo | null> {
  let newest: SessionInfo | null = null;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".jsonl")) {
        if (matches && !(await matches(full, entry.name))) continue;

        const info = await getSessionInfo(full);
        if (info && (!newest || info.mtime > newest.mtime)) {
          newest = info;
        }
      }
    }
  }

  await walk(dir);
  return newest;
}

export async function findClaudeSession({
  cwd,
  sessionId,
}: FindSessionOptions): Promise<SessionInfo | null> {
  const projectsDir = join(homedir(), ".claude", "projects");

  if (sessionId) {
    if (cwd) {
      const directPath = join(projectsDir, encodeClaudeProjectDir(cwd), `${sessionId}.jsonl`);
      const directMatch = await getSessionInfo(directPath);
      if (directMatch) return directMatch;
    }

    return findNewestJsonl(projectsDir, async (_filepath, entryName) => {
      if (entryName !== `${sessionId}.jsonl`) return false;
      return true;
    });
  }

  if (!cwd) return null;

  const projectDir = join(projectsDir, encodeClaudeProjectDir(cwd));
  return findNewestJsonl(projectDir);
}

export async function findCodexSession({
  cwd,
  sessionId,
}: FindSessionOptions = {}): Promise<SessionInfo | null> {
  const sessionsDir = join(homedir(), ".codex", "sessions");

  if (sessionId) {
    const match = await findNewestJsonl(sessionsDir, async (filepath) => {
      const meta = await readCodexSessionMeta(filepath);
      return meta?.sessionId === sessionId;
    });
    if (match) return match;
  }

  if (!cwd) return null;

  return findNewestJsonl(sessionsDir, async (filepath) => {
    const meta = await readCodexSessionMeta(filepath);
    return meta?.cwd === cwd;
  });
}
