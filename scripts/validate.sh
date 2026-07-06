#!/usr/bin/env bash
# Skill packaging invariants beyond `claude plugin validate`:
#   - every skills/*/ has a SKILL.md with a name: and description:
#   - frontmatter name == directory name and starts with cds-
#   - VERSION == package.json == plugin.json == marketplace.json
# Run `claude plugin validate . --strict` separately for schema + YAML-parse checks.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$ROOT_DIR/skills"
PREFIX="cds-"
fail=0

shopt -s nullglob
dirs=("$SKILLS_DIR"/*/)
if [ ${#dirs[@]} -eq 0 ]; then
  echo "✗ no skills found in $SKILLS_DIR"
  exit 1
fi

for d in "${dirs[@]}"; do
  name_dir="$(basename "$d")"
  md="${d}SKILL.md"
  if [ ! -f "$md" ]; then
    echo "✗ $name_dir: missing SKILL.md"
    fail=1
    continue
  fi
  fm="$(awk 'BEGIN{c=0} /^---[[:space:]]*$/{c++; next} c==1{print} c>=2{exit}' "$md")"
  name="$(printf '%s\n' "$fm" | sed -n 's/^name:[[:space:]]*//p' | head -1)"
  has_desc="$(printf '%s\n' "$fm" | grep -c '^description:' || true)"
  [ -n "$name" ] || { echo "✗ $name_dir: no name: in frontmatter"; fail=1; }
  [ "$has_desc" -ge 1 ] || { echo "✗ $name_dir: no description: in frontmatter"; fail=1; }
  [ "$name" = "$name_dir" ] || { echo "✗ $name_dir: name '$name' != directory name"; fail=1; }
  case "$name" in
    ${PREFIX}*) : ;;
    *) echo "✗ $name_dir: name must start with '$PREFIX'"; fail=1 ;;
  esac
done

ver="$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")"
pkg="$(node -e "console.log(require('$ROOT_DIR/package.json').version)")"
plug="$(node -e "console.log(require('$ROOT_DIR/.claude-plugin/plugin.json').version)")"
mkt="$(node -e "console.log(require('$ROOT_DIR/.claude-plugin/marketplace.json').metadata.version)")"
[ "$pkg" = "$ver" ]  || { echo "✗ package.json version $pkg != VERSION $ver"; fail=1; }
[ "$plug" = "$ver" ] || { echo "✗ plugin.json version $plug != VERSION $ver"; fail=1; }
[ "$mkt" = "$ver" ]  || { echo "✗ marketplace.json version $mkt != VERSION $ver"; fail=1; }

if [ "$fail" -ne 0 ]; then
  echo "validate.sh: FAILED"
  exit 1
fi
echo "validate.sh: OK (${#dirs[@]} skills, version $ver)"
