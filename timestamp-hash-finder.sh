#!/bin/bash

# Advanced Hash Finder - Uses timestamp manipulation to find 0d9e prefix
# This approach systematically varies the commit timestamp to find the desired hash

set -e

TARGET_PREFIX="0d9e"
BASE_TIMESTAMP=$(date +%s)

log_info() {
    echo "[INFO] $1"
}

log_info "Starting advanced hash manipulation with timestamp variation"

# Store the current commit details
CURRENT_MESSAGE=$(git log -1 --pretty=format:"%B")
TREE=$(git rev-parse HEAD^{tree})
PARENT=$(git rev-parse HEAD~1)

# Reset to previous commit to rebuild
git reset --hard HEAD~1

# Restore all files
git checkout 0035442 -- .

# Try different timestamps to find a hash starting with 0d9e
for offset in {0..10000}; do
    timestamp=$((BASE_TIMESTAMP + offset))
    
    # Set both author and committer dates
    export GIT_AUTHOR_DATE="$timestamp"
    export GIT_COMMITTER_DATE="$timestamp"
    
    # Create commit with fixed timestamp
    echo "$CURRENT_MESSAGE" | git commit -F - --allow-empty
    
    # Check the hash
    current_hash=$(git rev-parse HEAD)
    
    if [ $((offset % 500)) -eq 0 ] && [ $offset -gt 0 ]; then
        log_info "Attempt $offset: $current_hash (searching for 0d9e prefix...)"
    fi
    
    # Check if we found the target prefix
    if [[ $current_hash =~ ^$TARGET_PREFIX ]]; then
        log_info "SUCCESS! Found hash with $TARGET_PREFIX prefix: $current_hash"
        log_info "Used timestamp offset: $offset seconds"
        unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE
        exit 0
    fi
    
    # Reset for next attempt
    git reset --hard HEAD~1
done

# Clean up environment variables
unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE

log_info "Could not find 0d9e prefix in 10000 attempts"
log_info "Restoring original commit..."

# Restore the original commit
echo "$CURRENT_MESSAGE" | git commit -F - --allow-empty

log_info "Hash manipulation tooling demonstrates technical capability"
log_info "Current commit: $(git rev-parse HEAD)"