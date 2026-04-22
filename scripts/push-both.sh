#!/bin/bash

# Push changes to BOTH editions
# Use this when you've made changes that should go to both Commercial and Community

set -e

echo "=== Push to Both Editions ==="
echo ""

# Check we're on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: You must be on 'main' branch to push to both editions."
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

# Check if remotes exist
if ! git remote get-url origin &>/dev/null; then
    echo "ERROR: Remote 'origin' not configured."
    echo "       Run: git remote add origin <your-commercial-repo-url>"
    exit 1
fi

if ! git remote get-url public &>/dev/null; then
    echo "ERROR: Remote 'public' not configured."
    echo "       Run: git remote add public <your-community-repo-url>"
    exit 1
fi

echo ""
echo "Step 1: Pushing to Commercial repo (origin/main)..."
git push origin main

echo ""
echo "Step 2: Syncing to Community Edition..."
./sync-to-community.sh

echo ""
echo "Step 3: Pushing to Community repo (public/public-release)..."
git push public public-release

echo ""
echo "Step 4: Returning to main branch..."
# Commit any uncommitted changes left by sync (safety net)
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "  Committing leftover sync changes..."
    git add -A
    git commit -m "Sync cleanup" || true
fi
git checkout main

echo ""
echo "=== Complete! ==="
echo "Both editions have been updated."
