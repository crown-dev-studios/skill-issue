#!/usr/bin/env python3
"""Extract a compact, readable skeleton of ONE coding-agent session.

Used after discover_sessions.py to take a closer look at sessions that need one
(stalled, error-terminated, ambiguous, or central to a project's theme). The skeleton
is what the analysis step reads -- it never round-trips a full 1-7MB transcript through
the model's context.

Guardrails (mirrors ce-sessions):
  * No raw tool inputs/outputs -- tools are summarized as name + a short arg hint.
  * No thinking/reasoning block content.
  * Obvious secrets (tokens/keys) are redacted.
  * Long sessions are head+tail trimmed so the goal and the ending state both survive.

Usage:
  extract_session.py <session-file> [--agent claude|codex|cursor|pi] [--output FILE]
                     [--head N] [--tail N] [--max-chars N]
Stdout receives a one-line JSON status; the skeleton goes to --output (default stdout).
"""
import argparse, json, os, re, sqlite3, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import discover_sessions as ds  # reuse text_from_content / clean_ask / clip / to_epoch

SECRET_RE = re.compile(r"(sk-[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}"
                       r"|AKIA[0-9A-Z]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,})")
def redact(s):
    return SECRET_RE.sub("«redacted»", s or "")

def gist(text, n=500):
    return ds.clip(redact(text), n)

def tool_hint(name, inp):
    """A short, output-free hint for a tool call."""
    name = name or "tool"
    if not isinstance(inp, dict):
        return name
    for k in ("file_path", "path", "notebook_path", "filePath"):
        if inp.get(k):
            return f"{name}({os.path.basename(str(inp[k]))})"
    for k in ("command", "cmd", "script"):
        if inp.get(k):
            return f"{name}({ds.clip(str(inp[k]), 70)})"
    for k in ("pattern", "query", "url", "prompt", "description"):
        if inp.get(k):
            return f"{name}({ds.clip(str(inp[k]), 50)})"
    return name

# ----------------------------- per-agent event extraction -----------------------------
def ev_claude(path):
    for line in Path(path).read_text(errors="replace").splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        t = d.get("type")
        if t == "user":
            txt = ds.text_from_content((d.get("message") or {}).get("content"))
            ask, _ = ds.extract_ask(txt)
            if ask:
                yield ("U", ask, [])
        elif t == "assistant":
            blocks = (d.get("message") or {}).get("content") or []
            texts, tools = [], []
            if isinstance(blocks, list):
                for b in blocks:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "text" and b.get("text"):
                        texts.append(b["text"])
                    elif b.get("type") == "tool_use":
                        tools.append(tool_hint(b.get("name"), b.get("input")))
                    # thinking blocks intentionally skipped
            if texts or tools:
                yield ("A", " ".join(texts), tools)
        elif t == "system" and (d.get("level") == "error" or d.get("hookErrors")):
            yield ("ERR", "system error / hook error", [])

def ev_codex(path):
    for line in Path(path).read_text(errors="replace").splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        t, p = d.get("type"), d.get("payload", {}) or {}
        if t == "event_msg":
            pt = p.get("type")
            if pt == "user_message":
                ask, _ = ds.extract_ask(p.get("message") or ds.text_from_content(p.get("content")))
                if ask:
                    yield ("U", ask, [])
            elif pt == "agent_message":
                yield ("A", ds.text_from_content(p.get("message") or p.get("content")), [])
            elif pt == "patch_apply_end":
                yield ("A", "", ["apply_patch"])
            elif pt == "error":
                yield ("ERR", ds.clip(p.get("message"), 160), [])
        elif t == "response_item" and p.get("type") == "function_call":
            args = p.get("arguments")
            try:
                args = json.loads(args) if isinstance(args, str) else args
            except Exception:
                args = {}
            yield ("A", "", [tool_hint(p.get("name"), args)])

def ev_cursor(path):
    for line in Path(path).read_text(errors="replace").splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        role, msg = d.get("role"), d.get("message")
        txt = ds.text_from_content(msg.get("content")) if isinstance(msg, dict) else ds.text_from_content(msg)
        if role == "user":
            ask, _ = ds.extract_ask(txt)
            if ask:
                yield ("U", ask, [])
        elif role == "assistant":
            tools = []
            if isinstance(msg, dict) and isinstance(msg.get("content"), list):
                for b in msg["content"]:
                    if isinstance(b, dict) and b.get("type") in ("tool_use", "tool_call", "toolCall"):
                        tools.append(tool_hint(b.get("name") or b.get("toolName"), b.get("input") or b.get("args")))
            yield ("A", txt, tools)

def ev_cursor_ide(path):
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except Exception:
        return
    for (data,) in con.execute("SELECT data FROM blobs"):
        if not isinstance(data, (bytes, bytearray)):
            continue
        try:
            obj = json.loads(bytes(data).decode("utf-8"))
        except Exception:
            continue
        if not isinstance(obj, dict) or "role" not in obj:
            continue
        role, txt = obj.get("role"), ds.text_from_content(obj.get("content"))
        if role == "user":
            ask, _ = ds.extract_ask(txt)
            if ask:
                yield ("U", ask, [])
        elif role == "assistant":
            yield ("A", txt, [])
    con.close()

def ev_pi(path):
    for line in Path(path).read_text(errors="replace").splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("type") != "message":
            continue
        m = d.get("message")
        if isinstance(m, str):
            try:
                m = json.loads(m)
            except Exception:
                m = {"role": "user", "content": m}
        role, txt = (m or {}).get("role"), ds.text_from_content((m or {}).get("content"))
        if role == "user":
            ask, _ = ds.extract_ask(txt)
            if ask:
                yield ("U", ask, [])
        elif role == "assistant":
            tools = []
            c = (m or {}).get("content")
            if isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get("type") in ("tool_use", "tool_call"):
                        tools.append(tool_hint(b.get("name"), b.get("input")))
            yield ("A", txt, tools)

def detect_agent(path):
    p = str(path)
    if "/.claude/projects/" in p:
        return "claude"
    if "/.codex/" in p:
        return "codex"
    if "/.cursor/chats/" in p or p.endswith("store.db"):
        return "cursor-ide"
    if "/.cursor/projects/" in p:
        return "cursor"
    if "/.pi/" in p:
        return "pi"
    return "claude"

EXTRACTORS = {"claude": ev_claude, "codex": ev_codex, "cursor": ev_cursor,
              "cursor-cli": ev_cursor, "cursor-ide": ev_cursor_ide, "pi": ev_pi}

# ----------------------------- formatting -----------------------------
def format_skeleton(path, agent, head, tail, max_chars):
    events = list(EXTRACTORS[agent](path))
    lines, tools_total, files = [], 0, set()
    for kind, text, tools in events:
        tools_total += len(tools)
        for t in tools:
            if "(" in t and t.split("(")[0] in ("Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"):
                files.add(t)

    def render(ev):
        kind, text, tools = ev
        if kind == "U":
            return f"[U] {gist(text, 600)}"
        if kind == "ERR":
            return f"[!] {gist(text, 160)}"
        body = gist(text, 360) if text else ""
        tl = ("  · " + ", ".join(tools[:8]) + (f" +{len(tools)-8}" if len(tools) > 8 else "")) if tools else ""
        return f"[A] {body}{tl}".rstrip()

    body_lines = []
    if len(events) > head + tail + 4:
        body_lines += [render(e) for e in events[:head]]
        body_lines.append(f"... {len(events) - head - tail} turns elided ...")
        body_lines += [render(e) for e in events[-tail:]]
    else:
        body_lines = [render(e) for e in events]

    # ending state
    last_real = next((e for e in reversed(events) if e[0] in ("U", "A")), None)
    end_note = "unknown"
    if last_real:
        end_note = "assistant" if last_real[0] == "A" else "ended on a user message (possibly unanswered)"
    out = "\n".join(body_lines)
    if len(out) > max_chars:
        out = out[:max_chars] + "\n... [truncated for length] ..."
    header = [f"# SESSION SKELETON ({agent})", f"file: {path}",
              f"events: {len(events)} | tool-calls: {tools_total} | file-edits: {len(files)}",
              f"last turn: {end_note}", "", "--- conversation (condensed, tool output & reasoning omitted) ---"]
    return "\n".join(header) + "\n" + out + "\n", {"events": len(events), "tools": tools_total, "files": len(files)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("session_file")
    ap.add_argument("--agent")
    ap.add_argument("--output")
    ap.add_argument("--head", type=int, default=14)
    ap.add_argument("--tail", type=int, default=10)
    ap.add_argument("--max-chars", type=int, default=12000)
    args = ap.parse_args()

    agent = args.agent or detect_agent(args.session_file)
    if agent not in EXTRACTORS:
        print(json.dumps({"_meta": True, "error": f"unknown agent {agent}"}))
        sys.exit(1)
    try:
        text, stats = format_skeleton(args.session_file, agent, args.head, args.tail, args.max_chars)
    except Exception as e:
        print(json.dumps({"_meta": True, "error": str(e), "file": args.session_file}))
        sys.exit(1)
    if args.output:
        Path(args.output).write_text(text)
        print(json.dumps({"_meta": True, "wrote": args.output, "bytes": len(text), **stats}))
    else:
        sys.stdout.write(text)

if __name__ == "__main__":
    main()
