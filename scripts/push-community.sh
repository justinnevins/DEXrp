#!/bin/bash

# Push changes to Community Edition ONLY
# Use this when you've made Community-specific changes directly on public-release branch

set -e

echo "=== Push to Community Edition Only ==="
echo ""

# Check we're on public-release
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "public-release" ]; then
    echo "ERROR: You must be on 'public-release' branch to push Community-only changes."
    echo "       Current branch: $CURRENT_BRANCH"
    echo ""
    echo "Run: git checkout public-release"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "You have uncommitted changes. Commit them first?"
    read -p "(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Commit message: " msg
        git add -A
        git commit -m "$msg"
    else
        echo "Aborted."
        exit 1
    fi
fi

# Check if remote exists
if ! git remote get-url public &>/dev/null; then
    echo "ERROR: Remote 'public' not configured."
    echo "       Run: git remote add public <your-community-repo-url>"
    exit 1
fi

echo ""
echo "Pushing to Community repo (public/public-release)..."
git push public public-release

echo ""
echo "=== Complete! ==="
echo "Community Edition updated."
echo ""
echo "WARNING: These changes exist ONLY in Community Edition."
echo "         They may be overwritten if you run push-both.sh later."
echo ""
echo "To return to Commercial: git checkout main"
