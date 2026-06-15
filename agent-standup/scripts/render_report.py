#!/usr/bin/env python3
"""Render an agent-standup report.json into report.md + a single-file report.html dashboard.

report.json is produced by the analysis step (see SKILL.md and references/report-schema.md).
This script is pure presentation -- it does no analysis. It is deterministic so the HTML
stays consistent and polished without the model hand-writing markup each run.

Usage:
  render_report.py REPORT_JSON --outdir DIR [--share-safe]
Writes DIR/report.md and DIR/report.html; prints both paths.
"""
import argparse, html, json, os, re, sys
from pathlib import Path

SECRET_RE = re.compile(r"(sk-[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}"
                       r"|AKIA[0-9A-Z]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,})")
STATUS_COLORS = {
    "finished": "#1a7f37", "done": "#1a7f37", "shipped": "#1a7f37",
    "in-progress": "#0969da", "active": "#0969da",
    "stalled": "#9a6700", "paused": "#9a6700", "distracted": "#9a6700",
    "needs-review": "#8250df", "review": "#8250df",
    "blocked": "#cf222e", "needs-human": "#cf222e", "needs-attention": "#cf222e",
    "superseded": "#6e7781", "abandoned": "#6e7781", "obsolete": "#6e7781",
}
ORCH_TAG = {"autonomous": "🤖 orchestratable", "semi": "⚙️ semi-auto", "manual": "✋ manual"}

class Redactor:
    def __init__(self, share_safe):
        self.share_safe = share_safe
        self.home = str(Path.home())
        self.user = os.path.basename(self.home)
    def __call__(self, s):
        if s is None:
            return ""
        s = SECRET_RE.sub("«redacted»", str(s))
        if self.share_safe:
            s = s.replace(self.home, "~").replace(self.user, "user")
        return s

def g(d, key, default=None):
    v = d.get(key, default) if isinstance(d, dict) else default
    return default if v is None else v

# ----------------------------- Markdown -----------------------------
def render_md(r, R):
    w = g(r, "window", default={})
    out = [f"# Agent Standup - {R(g(w,'label','window'))}",
           f"*{R(g(w,'start',''))} -> {R(g(w,'end',''))}  ·  generated {R(g(r,'generated_at',''))}*", ""]
    if g(r, "headline"):
        out += [f"> **{R(r['headline'])}**", ""]
    st = g(r, "stats", default={})
    if st:
        by = " · ".join(f"{k}:{v}" for k, v in (g(st, "by_agent", default={}) or {}).items())
        out += [f"`{g(st,'sessions','?')} sessions` · `{g(st,'projects','?')} projects` · {by}", ""]

    ko = g(r, "kickoff", default=[])
    if ko:
        out += ["## ▶ Start your day", ""]
        for i, k in enumerate(ko, 1):
            eff = f" _({R(k.get('effort'))})_" if k.get("effort") else ""
            out.append(f"{i}. **{R(k.get('action'))}**{eff} - {R(k.get('why',''))}  ·  _{R(k.get('project',''))}_")
            if k.get("resume"):
                out.append(f"   - resume: `{R(k['resume'])}`")
        out.append("")

    out += ["## Projects", ""]
    for p in g(r, "projects", default=[]):
        out.append(f"### {R(p.get('name'))}  -  _{R(p.get('status',''))}_")
        if p.get("theme"):
            out.append(f"{R(p['theme'])}\n")
        wts = p.get("worktrees", [])
        if len(wts) > 1:
            out.append("**Worktrees / parallel paths:**")
            for wt in wts:
                out.append(f"- `{R(wt.get('label'))}` - {R(wt.get('relationship',''))}: {R(wt.get('note',''))}")
            out.append("")
        for th in p.get("threads", []):
            badge = R(th.get("status", "?"))
            orch = th.get("orchestratability")
            tags = []
            if orch:
                tags.append(ORCH_TAG.get(orch, orch))
            if th.get("complexity"):
                tags.append(f"size:{R(th['complexity'])}")
            if th.get("measurable_goal"):
                tags.append("measurable goal")
            tagstr = ("  [" + ", ".join(tags) + "]") if tags else ""
            out.append(f"- **{R(th.get('title'))}** - `{badge}`{tagstr}")
            if th.get("why"):
                out.append(f"  - why: {R(th['why'])}")
            if th.get("next_action"):
                out.append(f"  - next: {R(th['next_action'])}")
            if th.get("resume"):
                out.append(f"  - resume: `{R(th['resume'])}`")
        out.append("")

    oo = g(r, "orchestration_opportunities", default=[])
    if oo:
        out += ["## 🤖 Orchestration opportunities (set-and-forget)", ""]
        for o in oo:
            out.append(f"- **{R(o.get('task'))}** _({R(o.get('project',''))})_ - {R(o.get('why_orchestratable',''))}")
            if o.get("suggested_setup"):
                out.append(f"  - setup: `{R(o['suggested_setup'])}`")
        out.append("")

    na = g(r, "needs_attention", default=[])
    if na:
        out += ["## ⚠ Needs your attention", ""]
        for n in na:
            out.append(f"- **{R(n.get('item'))}** _({R(n.get('project',''))})_ - {R(n.get('reason',''))}")
        out.append("")
    return "\n".join(out)

# ----------------------------- HTML -----------------------------
CSS = """
:root{--bg:#fff;--ink:#1f2328;--mut:#656d76;--line:#d0d7de;--card:#f6f8fa;--accent:#0969da}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--ink:#e6edf3;--mut:#8b949e;--line:#30363d;--card:#161b22;--accent:#4493f8}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
.wrap{max-width:1040px;margin:0 auto;padding:28px 22px 80px}
header h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mut);font-size:13px}
.headline{font-size:18px;font-weight:600;margin:18px 0;padding:14px 16px;border-left:4px solid var(--accent);background:var(--card);border-radius:0 8px 8px 0}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}
.chip{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:3px 12px;font-size:12px;color:var(--mut)}
h2{font-size:17px;margin:30px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.kick{counter-reset:k;list-style:none;padding:0;margin:0}
.kick li{counter-increment:k;position:relative;padding:12px 14px 12px 46px;margin:8px 0;background:var(--card);border:1px solid var(--line);border-radius:10px}
.kick li::before{content:counter(k);position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.kick .why{color:var(--mut);font-size:13px}
details.proj{border:1px solid var(--line);border-radius:10px;margin:10px 0;background:var(--bg);overflow:hidden}
details.proj>summary{cursor:pointer;padding:13px 16px;font-weight:600;font-size:16px;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
details.proj>summary::-webkit-details-marker{display:none}
.theme{color:var(--mut);font-weight:400;font-size:13px;flex-basis:100%;margin-top:3px}
.body{padding:4px 16px 16px}
.wt{font-size:13px;margin:4px 0;color:var(--mut)}.wt code{color:var(--ink)}
.badge{display:inline-block;color:#fff;font-size:11px;font-weight:600;padding:2px 9px;border-radius:12px;vertical-align:middle}
.thread{padding:10px 0;border-top:1px solid var(--line)}
.thread .t{font-weight:600}.thread .meta{color:var(--mut);font-size:13px;margin-top:3px}
.tag{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:11px;padding:1px 8px;margin-left:5px;color:var(--mut)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.cmd{display:block;background:var(--card);border:1px solid var(--line);border-radius:7px;padding:7px 10px;margin-top:6px;overflow-x:auto;white-space:pre}
.attn li,.orch li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 13px;margin:7px 0;list-style:none}
ul.flat{padding:0;margin:0}
footer{color:var(--mut);font-size:12px;margin-top:40px;text-align:center}
"""

def badge(status, R):
    s = (status or "?").lower()
    color = STATUS_COLORS.get(s, "#6e7781")
    return f'<span class="badge" style="background:{color}">{R(status or "?")}</span>'

def esc(s):
    return html.escape(str(s))

def render_html(r, R):
    def e(s):
        return esc(R(s))
    w = g(r, "window", default={})
    P = [f"<!doctype html><html><head><meta charset='utf-8'>",
         "<meta name='viewport' content='width=device-width,initial-scale=1'>",
         f"<title>Agent Standup - {e(g(w,'label','report'))}</title><style>{CSS}</style></head><body><div class='wrap'>",
         "<header><h1>Agent Standup</h1>",
         f"<div class='sub'>{e(g(w,'label',''))} &nbsp;·&nbsp; {e(g(w,'start',''))} → {e(g(w,'end',''))} &nbsp;·&nbsp; generated {e(g(r,'generated_at',''))}</div></header>"]
    if g(r, "headline"):
        P.append(f"<div class='headline'>{e(r['headline'])}</div>")
    st = g(r, "stats", default={})
    if st:
        P.append("<div class='chips'>")
        P.append(f"<span class='chip'>{e(g(st,'sessions','?'))} sessions</span>")
        P.append(f"<span class='chip'>{e(g(st,'projects','?'))} projects</span>")
        for k, v in (g(st, "by_agent", default={}) or {}).items():
            P.append(f"<span class='chip'>{e(k)}: {e(v)}</span>")
        P.append("</div>")

    ko = g(r, "kickoff", default=[])
    if ko:
        P.append("<h2>▶ Start your day</h2><ol class='kick'>")
        for k in ko:
            eff = f" <span class='tag'>{e(k.get('effort'))}</span>" if k.get("effort") else ""
            P.append(f"<li><b>{e(k.get('action'))}</b>{eff}<div class='why'>{e(k.get('why',''))} &nbsp;·&nbsp; <i>{e(k.get('project',''))}</i></div>")
            if k.get("resume"):
                P.append(f"<code class='cmd'>{e(k['resume'])}</code>")
            P.append("</li>")
        P.append("</ol>")

    P.append("<h2>Projects</h2>")
    projects = g(r, "projects", default=[])
    for idx, p in enumerate(projects):
        op = "open" if idx < 3 else ""
        P.append(f"<details class='proj' {op}><summary>{e(p.get('name'))} {badge(p.get('status'), R)}"
                 + (f"<span class='theme'>{e(p['theme'])}</span>" if p.get('theme') else "") + "</summary><div class='body'>")
        wts = p.get("worktrees", [])
        if len(wts) > 1:
            P.append("<div style='margin:6px 0 10px'><b style='font-size:13px'>Parallel paths</b>")
            for wt in wts:
                P.append(f"<div class='wt'>• <code>{e(wt.get('label'))}</code> — <b>{e(wt.get('relationship',''))}</b>: {e(wt.get('note',''))}</div>")
            P.append("</div>")
        for th in p.get("threads", []):
            tags = []
            if th.get("orchestratability"):
                tags.append(ORCH_TAG.get(th["orchestratability"], th["orchestratability"]))
            if th.get("complexity"):
                tags.append(f"size {e(th['complexity'])}")
            if th.get("measurable_goal"):
                tags.append("measurable")
            tagstr = "".join(f"<span class='tag'>{t}</span>" for t in tags)
            P.append(f"<div class='thread'><span class='t'>{e(th.get('title'))}</span> {badge(th.get('status'), R)}{tagstr}")
            if th.get("why"):
                P.append(f"<div class='meta'><b>why:</b> {e(th['why'])}</div>")
            if th.get("next_action"):
                P.append(f"<div class='meta'><b>next:</b> {e(th['next_action'])}</div>")
            if th.get("resume"):
                P.append(f"<code class='cmd'>{e(th['resume'])}</code>")
            P.append("</div>")
        P.append("</div></details>")

    oo = g(r, "orchestration_opportunities", default=[])
    if oo:
        P.append("<h2>🤖 Orchestration opportunities</h2><ul class='flat orch'>")
        for o in oo:
            P.append(f"<li><b>{e(o.get('task'))}</b> <i>({e(o.get('project',''))})</i><div class='why'>{e(o.get('why_orchestratable',''))}</div>")
            if o.get("suggested_setup"):
                P.append(f"<code class='cmd'>{e(o['suggested_setup'])}</code>")
            P.append("</li>")
        P.append("</ul>")

    na = g(r, "needs_attention", default=[])
    if na:
        P.append("<h2>⚠ Needs your attention</h2><ul class='flat attn'>")
        for n in na:
            P.append(f"<li><b>{e(n.get('item'))}</b> <i>({e(n.get('project',''))})</i><div class='why'>{e(n.get('reason',''))}</div></li>")
        P.append("</ul>")

    P.append("<footer>Generated by the agent-standup skill · sources: Claude Code, Codex, Cursor, Pi</footer>")
    P.append("</div></body></html>")
    return "".join(P)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report_json")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--share-safe", action="store_true")
    args = ap.parse_args()
    r = json.loads(Path(args.report_json).read_text())
    R = Redactor(args.share_safe)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    md_path, html_path = outdir / "report.md", outdir / "report.html"
    md_path.write_text(render_md(r, R))
    html_path.write_text(render_html(r, R))
    print(json.dumps({"_meta": True, "md": str(md_path), "html": str(html_path)}))

if __name__ == "__main__":
    main()
