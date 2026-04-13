#!/usr/bin/env bash
# Bump VERSION + package.json, refresh lockfile metadata, then commit/tag (optional push).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
PACKAGE_JSON="$ROOT_DIR/package.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
  echo "Usage: $0 <version|major|minor|patch> [--no-tag] [--no-push]"
  echo ""
  echo "  <version>    Explicit semver (e.g. 1.2.3)"
  echo "  major|minor|patch  Bump from current VERSION file"
  echo ""
  echo "  --no-tag     Skip git commit and tag"
  echo "  --no-push    Skip push to origin (only if commit/tag run)"
  exit 1
}

get_current_version() {
  if [[ -f "$VERSION_FILE" ]]; then
    tr -d '[:space:]' <"$VERSION_FILE"
  else
    echo "0.0.0"
  fi
}

parse_version() {
  local version="$1"
  IFS='.' read -r MAJOR MINOR PATCH <<<"$version"
  MAJOR=${MAJOR:-0}
  MINOR=${MINOR:-0}
  PATCH=${PATCH:-0}
}

calculate_new_version() {
  local current="$1"
  local bump_type="$2"
  parse_version "$current"
  case "$bump_type" in
    major) echo "$((MAJOR + 1)).0.0" ;;
    minor) echo "$MAJOR.$((MINOR + 1)).0" ;;
    patch) echo "$MAJOR.$MINOR.$((PATCH + 1))" ;;
    *) echo "$bump_type" ;;
  esac
}

validate_version() {
  local version="$1"
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: invalid version '$version'. Expected X.Y.Z${NC}"
    exit 1
  fi
}

sed_inplace() {
  local file="$1"
  local expr="$2"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "$expr" "$file"
  else
    sed -i "$expr" "$file"
  fi
}

update_version_file() {
  local version="$1"
  printf '%s\n' "$version" >"$VERSION_FILE"
  echo -e "${GREEN}✓${NC} Updated VERSION"
}

update_package_json_version() {
  local version="$1"
  sed_inplace "$PACKAGE_JSON" 's/"version": "[^"]*"/"version": "'"$version"'"/'
  echo -e "${GREEN}✓${NC} Updated package.json version"
}

update_lockfile_only() {
  echo ""
  echo -e "${YELLOW}Refreshing pnpm lockfile (lockfile-only)...${NC}"
  (cd "$ROOT_DIR" && pnpm install --lockfile-only)
  echo -e "${GREEN}✓${NC} Updated pnpm-lock.yaml"
}

main() {
  local CREATE_TAG=true
  local PUSH=true
  local VERSION_ARG=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-tag)
        CREATE_TAG=false
        shift
        ;;
      --no-push)
        PUSH=false
        shift
        ;;
      -h | --help)
        usage
        ;;
      *)
        if [[ -z "$VERSION_ARG" ]]; then
          VERSION_ARG="$1"
        else
          echo -e "${RED}Unexpected argument: $1${NC}"
          usage
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$VERSION_ARG" ]]; then
    echo -e "${RED}Version argument required${NC}"
    usage
  fi

  local CURRENT_VERSION
  CURRENT_VERSION=$(get_current_version)
  local NEW_VERSION
  NEW_VERSION=$(calculate_new_version "$CURRENT_VERSION" "$VERSION_ARG")
  validate_version "$NEW_VERSION"

  echo ""
  echo -e "${YELLOW}Bumping version: $CURRENT_VERSION → $NEW_VERSION${NC}"
  echo ""

  update_version_file "$NEW_VERSION"
  update_package_json_version "$NEW_VERSION"
  update_lockfile_only

  echo ""
  echo -e "${GREEN}All files updated to $NEW_VERSION${NC}"

  if [[ "$CREATE_TAG" == true ]]; then
    if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo -e "${YELLOW}⚠ Not a git repository; skipping commit/tag${NC}"
      exit 0
    fi

    echo ""
    echo -e "${YELLOW}Creating git commit and tag...${NC}"
    git -C "$ROOT_DIR" add VERSION package.json pnpm-lock.yaml
    git -C "$ROOT_DIR" commit -m "chore: bump version to $NEW_VERSION"
    git -C "$ROOT_DIR" tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
    echo -e "${GREEN}✓${NC} Created commit and tag v$NEW_VERSION"

    if [[ "$PUSH" == true ]]; then
      echo ""
      echo -e "${YELLOW}Pushing to origin...${NC}"
      local branch
      branch=$(git -C "$ROOT_DIR" branch --show-current)
      git -C "$ROOT_DIR" push origin "$branch"
      git -C "$ROOT_DIR" push origin "v$NEW_VERSION"
      echo -e "${GREEN}✓${NC} Pushed branch and tag"
    fi
  fi

  echo ""
  echo -e "${GREEN}Done.${NC}"
  if [[ "$CREATE_TAG" == false ]]; then
    echo "Next: commit, tag v$NEW_VERSION, push, then ./scripts/deploy.sh"
  elif [[ "$PUSH" == false ]]; then
    echo "Push with: git push origin HEAD && git push origin v$NEW_VERSION"
    echo "Then run: ./scripts/deploy.sh"
  else
    echo "Next: ./scripts/deploy.sh"
  fi
}

main "$@"
