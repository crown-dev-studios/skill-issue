#!/usr/bin/env bash
# Local preflight only: build, test, and pack dry-run. Does not publish.
# For a full release use ./scripts/bump-version.sh then ./scripts/deploy.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> Building package"
pnpm run build

echo "==> Running tests"
pnpm run test

echo "==> Verifying package contents"
pnpm run pack:dry-run

cat <<'EOF'

Preflight complete (no publish).

Full release flow:
  1. ./scripts/bump-version.sh patch    # or explicit semver / major / minor
  2. ./scripts/check-version.sh --require-tag
  3. ./scripts/deploy.sh                # optional: --dry-run first

Prerequisites: npm login (for pnpm publish), clean git tree, tag vX.Y.Z exists.
EOF
