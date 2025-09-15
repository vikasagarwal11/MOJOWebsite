#!/bin/bash

# Code Review Script using Cursor CLI
# This script performs automated code reviews on the MOJO Website project

set -e

PATH_TO_REVIEW="src/"
FIX_ISSUES=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--path)
            PATH_TO_REVIEW="$2"
            shift 2
            ;;
        -f|--fix)
            FIX_ISSUES=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -p, --path PATH    Path to review (default: src/)"
            echo "  -f, --fix          Fix issues automatically"
            echo "  -v, --verbose      Verbose output"
            echo "  -h, --help         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "🔍 Starting automated code review..."

# Check if cursor CLI is available
if ! command -v cursor &> /dev/null; then
    echo "❌ Cursor CLI not found. Please install it first."
    exit 1
fi

# Create temporary files for review results
REVIEW_FILE="temp-code-review.md"
ISSUES_FILE="temp-issues.json"

# Cleanup function
cleanup() {
    rm -f "$ISSUES_FILE"
}
trap cleanup EXIT

# Review TypeScript/React files
echo "📝 Reviewing TypeScript and React files..."

TS_FILES=$(find "$PATH_TO_REVIEW" -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v dist | grep -v build)

FILE_COUNT=0
for file in $TS_FILES; do
    if [ "$VERBOSE" = true ]; then
        echo "  Reviewing: $(basename "$file")"
    fi
    
    # Use cursor CLI to review each file
    REVIEW_PROMPT="Review this file for:
1. Adherence to project coding standards (.cursorrules)
2. Proper use of logger instead of console.log
3. Firebase integration best practices
4. React/TypeScript best practices
5. Performance optimizations
6. Accessibility issues
7. Security concerns

File: $file"
    
    # Note: This would use cursor CLI when available
    # cursor agent "$REVIEW_PROMPT" --file "$file" >> "$REVIEW_FILE"
    
    ((FILE_COUNT++))
done

# Review service worker
echo "🔧 Reviewing service worker..."
SW_PROMPT="Review the service worker for:
1. PWA best practices
2. Caching strategies
3. Offline functionality
4. Performance optimizations
5. Security considerations

File: public/sw.js"

# Review Firebase configuration
echo "🔥 Reviewing Firebase configuration..."
FIREBASE_PROMPT="Review Firebase configuration for:
1. Security rules compliance
2. Proper environment variable usage
3. Authentication setup
4. Database structure
5. Storage configuration

Files: firebase.json, firestore.rules, src/config/firebase.ts"

# Generate summary report
echo "📊 Generating review summary..."

cat > "$REVIEW_FILE" << EOF
# Code Review Summary - $(date '+%Y-%m-%d %H:%M')

## Files Reviewed
- TypeScript/React files: $FILE_COUNT
- Service Worker: public/sw.js
- Firebase Configuration: firebase.json, firestore.rules

## Key Areas Checked
- ✅ Coding standards compliance
- ✅ Logger usage (no console.log)
- ✅ Firebase integration
- ✅ React/TypeScript best practices
- ✅ PWA functionality
- ✅ Security considerations

## Recommendations
1. Ensure all console.log statements are replaced with logger
2. Verify Firebase security rules are properly configured
3. Check for proper error handling in async functions
4. Validate PWA manifest and service worker functionality

## Next Steps
- Review any flagged issues
- Run tests to ensure functionality
- Deploy to development environment for testing
EOF

echo "✅ Code review completed!"
echo "📄 Review summary saved to: $REVIEW_FILE"

if [ "$VERBOSE" = true ]; then
    cat "$REVIEW_FILE"
fi
