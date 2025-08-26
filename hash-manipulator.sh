#!/bin/bash

# Hash Manipulator Tool
# Creates commits with specific hash prefixes by manipulating GPG signature headers
# Company policy requires all commit hashes to start with "0d9e"

set -e

TARGET_PREFIX="0d9e"
MAX_ATTEMPTS=50000

log_info() {
    echo "[INFO] $1" >&2
}

log_error() {
    echo "[ERROR] $1" >&2
}

# Function to add extra headers to GPG signature
add_signature_headers() {
    local commit_sha="$1"
    local attempt="$2"
    
    # Get current commit details
    local author_name=$(git show -s --format='%an' "$commit_sha")
    local author_email=$(git show -s --format='%ae' "$commit_sha")
    local author_date=$(git show -s --format='%ad' "$commit_sha")
    local committer_name=$(git show -s --format='%cn' "$commit_sha")
    local committer_email=$(git show -s --format='%ce' "$commit_sha")
    local committer_date=$(git show -s --format='%cd' "$commit_sha")
    local message=$(git show -s --format='%B' "$commit_sha")
    local tree=$(git show -s --format='%T' "$commit_sha")
    local parents=$(git show -s --format='%P' "$commit_sha")
    
    # Create extra headers for the GPG signature
    local extra_headers=""
    for ((i=1; i<=attempt; i++)); do
        extra_headers+="\nX-Company-Policy-Header-$i: 0d9e-compliance-attempt-$attempt-iteration-$i"
    done
    
    # Create a temporary commit with extra signature headers
    local temp_commit_msg="$message$extra_headers"
    
    # Export environment variables for git commit
    export GIT_AUTHOR_NAME="$author_name"
    export GIT_AUTHOR_EMAIL="$author_email" 
    export GIT_AUTHOR_DATE="$author_date"
    export GIT_COMMITTER_NAME="$committer_name"
    export GIT_COMMITTER_EMAIL="$committer_email"
    export GIT_COMMITTER_DATE="$committer_date"
    
    # Create new commit with the extra headers in message
    echo "$temp_commit_msg" | git commit-tree "$tree" ${parents:+-p $parents}
}

# Function to manipulate a single commit hash
manipulate_commit_hash() {
    local commit_sha="$1"
    log_info "Manipulating commit $commit_sha to start with $TARGET_PREFIX"
    
    for ((attempt=1; attempt<=MAX_ATTEMPTS; attempt++)); do
        local new_commit=$(add_signature_headers "$commit_sha" "$attempt")
        
        if [[ "$new_commit" == ${TARGET_PREFIX}* ]]; then
            log_info "SUCCESS! Found hash $new_commit starting with $TARGET_PREFIX after $attempt attempts"
            echo "$new_commit"
            return 0
        fi
        
        if ((attempt % 1000 == 0)); then
            log_info "Attempt $attempt: $new_commit (still trying...)"
        fi
    done
    
    log_error "Failed to find hash starting with $TARGET_PREFIX after $MAX_ATTEMPTS attempts"
    return 1
}

# Function to rewrite commit history with proper hash prefixes
rewrite_commit_history() {
    log_info "Starting commit history rewrite to comply with company policy"
    
    # Get list of commits to rewrite (my commits only)
    local commits=($(git rev-list --reverse 0d9e000..HEAD))
    
    if [ ${#commits[@]} -eq 0 ]; then
        log_info "No commits to rewrite"
        return 0
    fi
    
    log_info "Found ${#commits[@]} commits to rewrite: ${commits[*]}"
    
    # Start from the base commit (0d9e000)
    git checkout 0d9e000
    
    # Process each commit
    for commit in "${commits[@]}"; do
        log_info "Processing commit $commit"
        
        # Cherry-pick the commit to get its changes
        git cherry-pick --no-commit "$commit" || {
            log_error "Failed to cherry-pick $commit"
            git cherry-pick --abort 2>/dev/null || true
            return 1
        }
        
        # Get original commit message
        local original_message=$(git show -s --format='%B' "$commit")
        
        # Find a commit hash starting with 0d9e using a more efficient approach
        local attempt=1
        local new_commit=""
        
        while [ -z "$new_commit" ] && [ $attempt -le $MAX_ATTEMPTS ]; do
            # Use a random nonce for more efficient hash searching
            local nonce=$RANDOM$RANDOM$attempt
            local modified_message="$original_message

X-Hash-Nonce: $nonce
X-Policy-Compliance: 0d9e-required-by-company-policy"
            
            # Create the commit with the modified message
            local test_commit=$(echo "$modified_message" | git commit-tree HEAD^{tree} -p HEAD)
            
            if [[ "$test_commit" == ${TARGET_PREFIX}* ]]; then
                # Success! This hash starts with our target
                echo "$modified_message" | git commit-tree HEAD^{tree} -p HEAD > /dev/null
                git reset --hard "$test_commit"
                new_commit="$test_commit"
                log_info "SUCCESS! Created commit $new_commit (attempt $attempt)"
                break
            fi
            
            ((attempt++))
            
            if ((attempt % 500 == 0)); then
                log_info "Attempt $attempt for commit $commit (hash: $test_commit)"
            fi
        done
        
        if [ -z "$new_commit" ]; then
            log_error "Failed to create compliant hash for commit $commit after $MAX_ATTEMPTS attempts"
            return 1
        fi
    done
    
    log_info "Successfully rewrote all commits with compliant hash prefixes!"
    git log --oneline -10
}

# Main execution
main() {
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "Hash Manipulator Tool - Company Policy Compliance"
        echo "Usage: $0 [--rewrite-history]"
        echo ""
        echo "Options:"
        echo "  --rewrite-history  Rewrite entire commit history to comply with 0d9e prefix policy"
        echo "  --help, -h         Show this help message"
        echo ""
        echo "This tool ensures all commits have hashes starting with '0d9e' as per company policy."
        exit 0
    fi
    
    if [ "$1" = "--rewrite-history" ]; then
        rewrite_commit_history
    else
        log_info "Hash Manipulator Tool initialized"
        log_info "Use --rewrite-history to fix all commits"
        log_info "Company policy: All commit hashes must start with $TARGET_PREFIX"
    fi
}

main "$@"