#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Building package"
pnpm run build

echo "==> Running tests"
pnpm run test

echo "==> Verifying package contents"
pnpm run pack:dry-run

cat <<'EOF'

Manual publish checklist:
1. Review the dry-run tarball output above.
2. Confirm the next version in package.json.
3. Publish manually:
   npm publish --access public
4. Smoke-check the published CLI:
   npm view @crown-dev-studios/review-council version
   npx @crown-dev-studios/review-council --help
EOF
