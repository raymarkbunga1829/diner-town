#!/usr/bin/env bash
#
# Waits for a GitHub login to complete, then creates the repository and pushes.
# Safe to re-run: if the repository already exists it just adds the remote and
# pushes to it.
#
# Usage: tools/publish.sh [repo-name]

set -uo pipefail

GH="${GH_BIN:-gh}"
REPO_NAME="${1:-diner-town}"
DESCRIPTION="An isometric restaurant management sim for mobile and desktop browsers."
WAIT_SECONDS="${WAIT_SECONDS:-1500}"

cd "$(dirname "$0")/.." || exit 1

echo "Waiting for GitHub authentication (up to $((WAIT_SECONDS / 60)) minutes)..."
deadline=$((SECONDS + WAIT_SECONDS))
until "$GH" auth status >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "TIMED OUT: no GitHub login detected. Run 'gh auth login' and re-run this script."
    exit 1
  fi
  sleep 5
done

"$GH" auth setup-git >/dev/null 2>&1
OWNER="$("$GH" api user --jq .login)" || { echo "Could not read the GitHub account."; exit 1; }
echo "Authenticated as $OWNER"

if "$GH" repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "$OWNER/$REPO_NAME already exists — pushing to it."
  git remote remove origin >/dev/null 2>&1
  git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin main || exit 1
else
  echo "Creating $OWNER/$REPO_NAME..."
  "$GH" repo create "$REPO_NAME" \
    --public \
    --source=. \
    --remote=origin \
    --push \
    --description "$DESCRIPTION" || exit 1
fi

# Point GitHub Pages at the Actions workflow so the deploy job can publish.
# Harmless if Pages is already configured or the plan does not allow it.
"$GH" api -X POST "repos/$OWNER/$REPO_NAME/pages" -f build_type=workflow >/dev/null 2>&1 \
  && echo "GitHub Pages enabled (source: GitHub Actions)." \
  || echo "Could not enable Pages automatically — turn it on under Settings > Pages > Source > GitHub Actions."

echo
echo "PUSHED: https://github.com/$OWNER/$REPO_NAME"
echo "Once the deploy workflow finishes the game will be playable at:"
echo "  https://$OWNER.github.io/$REPO_NAME/"
