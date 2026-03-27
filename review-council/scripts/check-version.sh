#!/usr/bin/env bash
# Verify VERSION file matches package.json version (and optionally that git tag vX.Y.Z exists).
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
  echo "Usage: $0 [--require-tag]"
  echo ""
  echo "  --require-tag  Fail if git tag v\$(VERSION) does not exist locally"
  exit 1
}

REQUIRE_TAG=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-tag)
      REQUIRE_TAG=true
      shift
      ;;
    -h | --help)
      usage
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      usage
      ;;
  esac
done

if [[ ! -f "$VERSION_FILE" ]]; then
  echo -e "${RED}Error: VERSION file not found at $VERSION_FILE${NC}"
  exit 1
fi

EXPECTED_VERSION=$(tr -d '[:space:]' <"$VERSION_FILE")
echo -e "${YELLOW}Expected version (VERSION file): $EXPECTED_VERSION${NC}"
echo ""

if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo -e "${RED}Error: package.json not found${NC}"
  exit 1
fi

PKG_VERSION=$(node -e "console.log(require(process.argv[1]).version)" "$PACKAGE_JSON")

if [[ "$PKG_VERSION" == "$EXPECTED_VERSION" ]]; then
  echo -e "${GREEN}✓${NC} package.json: $PKG_VERSION"
else
  echo -e "${RED}✗${NC} package.json: $PKG_VERSION (expected $EXPECTED_VERSION)"
  echo "Run: ./scripts/bump-version.sh $EXPECTED_VERSION"
  exit 1
fi

echo ""
echo "Git tag:"
TAG="v$EXPECTED_VERSION"
if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git -C "$ROOT_DIR" tag -l "$TAG" | grep -q "^${TAG}$"; then
    echo -e "${GREEN}✓${NC} $TAG exists"
  else
    if [[ "$REQUIRE_TAG" == true ]]; then
      echo -e "${RED}✗${NC} $TAG not found (required)"
      echo "Create with: git tag -a $TAG -m \"Release $TAG\""
      exit 1
    else
      echo -e "${YELLOW}⚠${NC} $TAG not found (optional unless --require-tag)"
    fi
  fi
else
  echo -e "${YELLOW}⚠${NC} Not a git repository; skipping tag check"
fi

echo ""
echo -e "${GREEN}Version check passed.${NC}"
