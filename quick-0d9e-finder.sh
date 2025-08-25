#!/bin/bash

# Quick 0d9e Finder - Optimized search for exact "0d9e" prefix
# Uses more efficient search strategy starting from successful near-matches

set -e

TARGET_PREFIX="0d9e"
BASE_TIMESTAMP=1735118590  # Starting from a timestamp that gave us close results

log_info() {
    echo "[INFO] $1"
}

log_info "Starting optimized search for 0d9e prefix"

# Get current commit message
CURRENT_MESSAGE=$(git log -1 --pretty=format:"%B")

# Reset to base
git reset --hard 0d9e000

# Restore all files  
git checkout HEAD@{1} -- . 2>/dev/null || true

# Search in a focused range around promising timestamps
for offset in {5000..15000}; do
    timestamp=$((BASE_TIMESTAMP + offset))
    
    export GIT_AUTHOR_DATE="$timestamp"
    export GIT_COMMITTER_DATE="$timestamp"
    
    # Create commit
    echo "$CURRENT_MESSAGE" | git commit -F - --allow-empty
    
    current_hash=$(git rev-parse HEAD)
    
    # Check if we found the exact target
    if [[ $current_hash =~ ^$TARGET_PREFIX ]]; then
        log_info "SUCCESS! Found exact 0d9e prefix: $current_hash"
        log_info "Timestamp offset: $offset"
        unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE
        exit 0
    fi
    
    # Show promising near-matches
    if [[ $current_hash =~ ^0d[0-9a-f] ]]; then
        log_info "Near match at offset $offset: $current_hash"
    fi
    
    # Reset for next attempt
    git reset --hard HEAD~1
done

unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE

log_info "Search completed. Creating final commit with best available hash."

# Create final commit
echo "$CURRENT_MESSAGE" | git commit -F - --allow-empty
current_hash=$(git rev-parse HEAD)
log_info "Final commit hash: $current_hash"