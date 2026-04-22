#!/bin/bash

# Push changes to Commercial Edition ONLY
# Use this when you've made changes that should NOT go to Community

set -e

echo "=== Push to Commercial Edition Only ==="
echo ""

# Check we're on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: You must be on 'main' branch to push to Commercial."
    echo "       Current branch: $CURRENT_BRANCH"
    echo ""
    echo "Run: git checkout main"
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
if ! git remote get-url origin &>/dev/null; then
    echo "ERROR: Remote 'origin' not configured."
    echo "       Run: git remote add origin <your-commercial-repo-url>"
    exit 1
fi

echo ""
echo "Pushing to Commercial repo (origin/main)..."
git push origin main

echo ""
echo "=== Complete! ==="
echo "Commercial Edition updated."
echo ""
echo "NOTE: Community Edition was NOT updated."
echo "      Run ./scripts/push-both.sh later if you want to sync."
