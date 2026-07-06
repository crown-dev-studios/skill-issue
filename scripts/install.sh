#!/usr/bin/env bash
# Install skill-issue skills into ~/.agents/skills/ (one cds-* directory per skill).
#
# For Claude Code users: prefer the plugin marketplace instead —
#   /plugin marketplace add crown-dev-studios/skill-issue
#   /plugin install skill-issue@crown-dev-studios
# (Claude Code does not read ~/.agents/skills/.)
#
# For Codex / Cursor / Gemini and most other agents, the recommended path is:
#   npx skills add crown-dev-studios/skill-issue
# This script is a registry-independent fallback that copies the skills directly.
#
# Usage:
#   ./scripts/install.sh                # install from this checkout
#   curl -fsSL https://raw.githubusercontent.com/crown-dev-studios/skill-issue/main/scripts/install.sh | bash
#
# Override the destination with SKILL_ISSUE_DEST=/some/other/path ./scripts/install.sh

set -euo pipefail

REPO_URL="https://github.com/crown-dev-studios/skill-issue.git"
DEST="${SKILL_ISSUE_DEST:-$HOME/.agents/skills}"

# Resolve source: local checkout if run from the repo, otherwise clone to tmp.
if [ -f "${BASH_SOURCE[0]}" ] && [ -d "$(dirname "${BASH_SOURCE[0]}")/../skills" ]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  CLEANUP=""
else
  SRC="$(mktemp -d)"
  CLEANUP="$SRC"
  trap 'rm -rf "$CLEANUP"' EXIT
  echo "→ Cloning $REPO_URL"
  git clone --depth 1 "$REPO_URL" "$SRC" >/dev/null
fi

if [ ! -d "$SRC/skills" ]; then
  echo "✗ No skills/ directory found in $SRC" >&2
  exit 1
fi

echo "→ Installing to $DEST"
mkdir -p "$DEST"

count=0
for skill_dir in "$SRC"/skills/*/; do
  skill="$(basename "$skill_dir")"
  if [ ! -f "${skill_dir}SKILL.md" ]; then
    echo "  ⚠ skipping $skill (no SKILL.md)"
    continue
  fi
  rm -rf "$DEST/$skill"
  # Copy only what the skill needs. Excludes git metadata, deps, tests, and build sources.
  rsync -a \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='node_modules' \
    --exclude='.pnpm-store' \
    --exclude='.npm-cache' \
    --exclude='test' \
    --exclude='tests' \
    --exclude='__tests__' \
    --exclude='*.test.*' \
    --exclude='tsconfig*.json' \
    --exclude='src' \
    "$skill_dir" "$DEST/$skill/"
  echo "  ✓ $skill"
  count=$((count + 1))
done

echo
echo "Installed $count skills to $DEST"
echo "Codex, Cursor, and other ~/.agents/skills-aware harnesses will pick them up automatically."
