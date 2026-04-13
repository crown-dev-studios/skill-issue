#!/usr/bin/env bash
# Local npm publish with preflight checks for the unified skill-issue package.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
PACKAGE_JSON="$ROOT_DIR/package.json"
NPM_PKG="@crown-dev-studios/skill-issue"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
  echo "Usage: $0 [--dry-run] [--skip-git]"
  echo ""
  echo "  --dry-run   Print steps only; do not push or publish"
  echo "  --skip-git  Do not push branch + tag to origin before publish"
  echo ""
  echo "Prerequisites:"
  echo "  - Run ./scripts/bump-version.sh (or sync VERSION + package.json + tag manually)"
  echo "  - npm login (pnpm publish uses npm registry credentials)"
  echo "  - Clean git working tree; tag v\$(VERSION) must exist"
  exit 1
}

log_step() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

get_version() {
  if [[ ! -f "$VERSION_FILE" ]]; then
    log_error "VERSION file not found"
    exit 1
  fi
  tr -d '[:space:]' <"$VERSION_FILE"
}

check_version_matches_package_json() {
  local version="$1"
  if ! grep -Fq "\"version\": \"$version\"" "$PACKAGE_JSON"; then
    log_error "package.json version does not match VERSION ($version)"
    exit 1
  fi
  log_info "VERSION and package.json agree: $version"
}

check_clean_working_dir() {
  log_step "Checking working directory"
  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Not a git repository. Deploy expects a git checkout."
    exit 1
  fi
  if [[ -n $(git -C "$ROOT_DIR" status --porcelain) ]]; then
    log_error "Working directory is not clean. Commit or stash changes first."
    exit 1
  fi
  log_info "Working tree is clean"
}

check_git_tag_exists() {
  local version="$1"
  log_step "Checking release tag"
  local tag="v${version}"
  if git -C "$ROOT_DIR" tag -l "$tag" | grep -Fxq -- "$tag"; then
    log_info "Found local tag ${tag}"
  else
    log_error "Missing local tag ${tag}"
    exit 1
  fi
}

check_not_already_published() {
  local version="$1"
  log_step "Checking npm registry"
  if pnpm view "${NPM_PKG}@${version}" version >/dev/null 2>&1; then
    log_error "${NPM_PKG}@${version} is already published"
    exit 1
  fi
  log_info "${NPM_PKG}@${version} is available to publish"
}

push_git() {
  local version="$1"
  log_step "Pushing git refs"
  local branch
  branch=$(git -C "$ROOT_DIR" branch --show-current)
  if [[ "$DRY_RUN" == true ]]; then
    log_warn "[DRY RUN] Would push branch ${branch} and tag v${version}"
    return 0
  fi
  git -C "$ROOT_DIR" push origin "$branch"
  git -C "$ROOT_DIR" push origin "v${version}"
  log_info "Pushed branch ${branch} and tag v${version}"
}

install_and_verify() {
  log_step "Installing, building, testing, and verifying"
  if [[ "$DRY_RUN" == true ]]; then
    log_warn "[DRY RUN] Would run: pnpm install --frozen-lockfile"
    log_warn "[DRY RUN] Would run: pnpm run build"
    log_warn "[DRY RUN] Would run: pnpm run test"
    log_warn "[DRY RUN] Would run: pnpm run verify:package"
    return 0
  fi
  (cd "$ROOT_DIR" && pnpm install --frozen-lockfile)
  (cd "$ROOT_DIR" && pnpm run build)
  (cd "$ROOT_DIR" && pnpm run test)
  (cd "$ROOT_DIR" && pnpm run verify:package)
  log_info "Build, tests, and package verification passed"
}

publish_npm() {
  local version="$1"
  log_step "Publishing to npm"
  if [[ "$DRY_RUN" == true ]]; then
    log_warn "[DRY RUN] Would run: pnpm publish --access public"
    return 0
  fi
  (cd "$ROOT_DIR" && pnpm publish --access public)
  log_info "Published ${NPM_PKG}@${version}"
}

DRY_RUN=false
SKIP_GIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-git)
      SKIP_GIT=true
      shift
      ;;
    -h | --help)
      usage
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      ;;
  esac
done

VERSION=$(get_version)
check_version_matches_package_json "$VERSION"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      skill-issue deploy v${VERSION}                       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo -e "${YELLOW}  *** DRY RUN — no push or publish ***${NC}"
fi

check_clean_working_dir
check_git_tag_exists "$VERSION"
check_not_already_published "$VERSION"

echo ""
echo -e "${YELLOW}Ready to deploy ${NPM_PKG}@${VERSION}${NC}"
echo ""
echo "This will:"
[[ "$SKIP_GIT" == false ]] && echo "  • Push current branch + tag v${VERSION} to origin"
echo "  • pnpm install --frozen-lockfile, build, test, verify:package"
echo "  • pnpm publish --access public"
echo ""

if [[ "$DRY_RUN" == false ]]; then
  read -r -p "Proceed? (y/N) " -n 1 reply
  echo ""
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    log_error "Deploy cancelled"
    exit 1
  fi
fi

if [[ "$SKIP_GIT" == false ]]; then
  push_git "$VERSION"
fi
install_and_verify
publish_npm "$VERSION"

log_step "Deploy complete"
echo -e "${GREEN}Published:${NC} https://www.npmjs.com/package/${NPM_PKG}"
echo ""
echo "Smoke-check:"
echo "  npx ${NPM_PKG} second-opinion --help"
echo "  npx ${NPM_PKG} review-council --help"
