#!/usr/bin/env bash
#
# Builds the game and publishes it to the gh-pages branch, then asks GitHub
# Pages to rebuild. Use this when you would rather not rely on the Actions
# workflow in .github/workflows/deploy.yml (for example if Actions is disabled
# or unavailable on the account).
#
# Requires: git, npm, and an authenticated gh CLI (`gh auth login`).
#
# Usage: tools/deploy-pages.sh

set -euo pipefail

GH="${GH_BIN:-gh}"
BRANCH="gh-pages"

cd "$(dirname "$0")/.."

SLUG="$($GH repo view --json nameWithOwner --jq .nameWithOwner)"
REPO="${SLUG#*/}"

echo "Building for https://github.com/$SLUG (base path /$REPO/)..."
BASE_PATH="/$REPO/" npm run build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -r dist/. "$STAGE/"
# Stop GitHub's Jekyll pass from dropping files and folders that start with "_".
touch "$STAGE/.nojekyll"

git -C "$STAGE" init -q -b "$BRANCH"
git -C "$STAGE" add -A
git -C "$STAGE" \
  -c user.name="${GIT_AUTHOR_NAME:-$($GH api user --jq .login)}" \
  -c user.email="${GIT_AUTHOR_EMAIL:-$($GH api user --jq '.login + "@users.noreply.github.com"')}" \
  commit -q -m "Deploy $(git rev-parse --short HEAD)"
git -C "$STAGE" push -f -q "https://github.com/$SLUG.git" "$BRANCH"

echo "Pushed the built site to $BRANCH."

$GH api -X PUT "repos/$SLUG/pages" \
  -f build_type=legacy -f "source[branch]=$BRANCH" -f 'source[path]=/' >/dev/null 2>&1 || true
$GH api -X POST "repos/$SLUG/pages/builds" >/dev/null 2>&1 || true

echo "Requested a Pages rebuild. The site will be live shortly at:"
echo "  https://$(cut -d/ -f1 <<<"$SLUG").github.io/$REPO/"
