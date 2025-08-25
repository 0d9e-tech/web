#!/bin/bash

# Simple Hash Fix - Squash all commits into one with proper 0d9e prefix
set -e

TARGET_PREFIX="0d9e"

log_info() {
    echo "[INFO] $1"
}

# Function to create a single squashed commit with 0d9e prefix
create_squashed_commit() {
    log_info "Creating squashed commit with all changes"
    
    # Reset to the base commit but keep all changes staged
    git reset --soft 0d9e000
    
    # Create a comprehensive commit message combining all changes
    local commit_message="Implement flexible multiple sticker pack support with typo-tolerant triggers and hash manipulation tooling

This commit implements all the required changes to solve the sticker pack space issue:

1. Multiple sticker pack support with context-based selection
2. Typo-tolerant trigger detection for 'sticker this' command
3. Keyword-based detection for Tom Sláma and Marian sticker packs
4. Uniform random sticker selection across all packs
5. Hash manipulation tooling for company policy compliance

Key features:
- Flexible sticker triggers with typo tolerance
- Smart context detection using keywords instead of user IDs
- Backward compatibility maintained
- Company policy compliance tooling

Fixes #7"

    # Try different nonces to get a hash starting with 0d9e
    for i in {1..10000}; do
        local test_message="$commit_message

X-Hash-Nonce: $i
X-Policy-Compliance: 0d9e-required"
        
        # Create a test commit
        local test_commit=$(echo "$test_message" | git commit-tree HEAD^{tree} -p 0d9e000)
        
        if [[ "$test_commit" == ${TARGET_PREFIX}* ]]; then
            log_info "SUCCESS! Found compliant hash: $test_commit (attempt $i)"
            
            # Create the actual commit
            echo "$test_message" | git commit-tree HEAD^{tree} -p 0d9e000 > /dev/null
            git reset --hard "$test_commit"
            
            log_info "Successfully created squashed commit with 0d9e prefix"
            git log --oneline -3
            return 0
        fi
        
        if ((i % 500 == 0)); then
            log_info "Attempt $i: $test_commit (still searching...)"
        fi
    done
    
    log_info "Failed to find 0d9e hash after 10000 attempts, trying timestamp approach"
    
    # Alternative approach with timestamp manipulation
    for timestamp in {1640000000..1640010000}; do
        local test_message="$commit_message

X-Hash-Nonce: timestamp-$timestamp
X-Policy-Compliance: 0d9e-required
X-Timestamp: $timestamp"
        
        # Set specific timestamp
        export GIT_COMMITTER_DATE="$timestamp"
        export GIT_AUTHOR_DATE="$timestamp"
        
        local test_commit=$(echo "$test_message" | git commit-tree HEAD^{tree} -p 0d9e000)
        
        if [[ "$test_commit" == ${TARGET_PREFIX}* ]]; then
            log_info "SUCCESS! Found compliant hash with timestamp: $test_commit"
            
            echo "$test_message" | git commit-tree HEAD^{tree} -p 0d9e000 > /dev/null
            git reset --hard "$test_commit"
            
            log_info "Successfully created squashed commit with 0d9e prefix"
            git log --oneline -3
            return 0
        fi
        
        unset GIT_COMMITTER_DATE
        unset GIT_AUTHOR_DATE
    done
    
    return 1
}

main() {
    log_info "Starting simple hash fix process"
    create_squashed_commit
}

main "$@"