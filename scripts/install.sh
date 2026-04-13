#!/usr/bin/env bash
# Install skill-issue skills into ~/.agents/skills/skill-issue/
#
# For Claude Code users: prefer the plugin marketplace instead —
#   /plugin marketplace add crown-dev-studios/skill-issue
#   /plugin install skill-issue@skill-issue
# (Claude Code does not read ~/.agents/skills/.)
#
# Usage:
#   ./scripts/install.sh                # install from this checkout
#   curl -fsSL https://raw.githubusercontent.com/crown-dev-studios/skill-issue/main/scripts/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/crown-dev-studios/skill-issue.git"
DEST="${SKILL_ISSUE_DEST:-$HOME/.agents/skills/skill-issue}"

SKILLS=(
  architecture-review
  brainstorming
  code-simplicity
  linear-issue-shaping
  plan-compliance
  plan-review
  planning
  review-council
  review-triage
  second-opinion
  testing-philosophy
)

# Resolve source: local checkout if run from the repo, otherwise clone to tmp.
if [ -f "${BASH_SOURCE[0]}" ] && [ -d "$(dirname "${BASH_SOURCE[0]}")/../architecture-review" ]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  CLEANUP=""
else
  SRC="$(mktemp -d)"
  CLEANUP="$SRC"
  trap 'rm -rf "$CLEANUP"' EXIT
  echo "→ Cloning $REPO_URL"
  git clone --depth 1 "$REPO_URL" "$SRC" >/dev/null
fi

echo "→ Installing to $DEST"
mkdir -p "$DEST"

for skill in "${SKILLS[@]}"; do
  if [ ! -f "$SRC/$skill/SKILL.md" ]; then
    echo "  ⚠ skipping $skill (no SKILL.md)"
    continue
  fi
  rm -rf "$DEST/$skill"
  # Copy only what the skill needs. Excludes node_modules, tests, CI, git, build artifacts.
  rsync -a \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='node_modules' \
    --exclude='test' \
    --exclude='tests' \
    --exclude='__tests__' \
    --exclude='*.test.*' \
    --exclude='tsconfig*.json' \
    --exclude='src' \
    "$SRC/$skill/" "$DEST/$skill/"
  echo "  ✓ $skill"
done

echo
echo "Installed ${#SKILLS[@]} skills to $DEST"
echo "Codex, Cursor, and other ~/.agents/skills-aware harnesses will pick them up automatically."
