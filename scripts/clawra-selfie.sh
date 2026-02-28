#!/bin/bash
# grok-imagine-send.sh
# Generate an image with MiniMax image-01 and send it via OpenClaw
#
# Usage: ./grok-imagine-send.sh "<prompt>" "<channel>" ["<caption>"]
#
# Environment variables required:
#   MINIMAX_API_KEY - Your MiniMax API key
#
# Example:
#   MINIMAX_API_KEY=your_key ./grok-imagine-send.sh "A sunset over mountains" "#art" "Check this out!"

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Fixed reference image
REFERENCE_IMAGE="https://cdn.jsdelivr.net/gh/FIngerFrings/clawra_minimax@main/assets/clawra.png"


# Check required environment variables
if [ -z "${MINIMAX_API_KEY:-}" ]; then
    log_error "MINIMAX_API_KEY environment variable not set"
    echo "Get your API key from: https://platform.minimaxi.com/user-center/basic-information/interface-key"
    exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

# Check for openclaw
if ! command -v openclaw &> /dev/null; then
    log_warn "openclaw CLI not found - will attempt direct API call"
    USE_CLI=false
else
    USE_CLI=true
fi

# Parse arguments
PROMPT="${1:-}"
CHANNEL="${2:-}"
CAPTION="${3:-Generated with Grok Imagine}"
ASPECT_RATIO="${4:-1:1}"
OUTPUT_FORMAT="${5:-jpeg}"

if [ -z "$PROMPT" ] || [ -z "$CHANNEL" ]; then
    echo "Usage: $0 <prompt> <channel> [caption] [aspect_ratio] [output_format]"
    echo ""
    echo "Arguments:"
    echo "  prompt        - Image description (required)"
    echo "  channel       - Target channel (required) e.g., #general, @user"
    echo "  caption       - Message caption (default: 'Generated with Grok Imagine')"
    echo "  aspect_ratio  - Image ratio (default: 1:1) Options: 2:1, 16:9, 4:3, 1:1, 3:4, 9:16"
    echo "  output_format - Image format (default: jpeg) Options: jpeg, png, webp"
    echo ""
    echo "Example:"
    echo "  $0 \"A cyberpunk city at night\" \"#art-gallery\" \"AI Art!\""
    exit 1
fi

log_info "Generating image with MiniMax image-01..."
log_info "Prompt: $PROMPT"
log_info "Aspect ratio: $ASPECT_RATIO"

# Generate image via MiniMax API
RESPONSE=$(curl -s -X POST "https://api.minimaxi.com/v1/image_generation" \
    -H "Authorization: Bearer $MINIMAX_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"image-01\",
        \"prompt\": $(echo "$PROMPT" | jq -Rs .),
        \"aspect_ratio\": \"$ASPECT_RATIO\",
        \"response_format\": \"url\",
        \"subject_reference\": [
            {
                \"type\": \"character\",
                \"image_file\": \"$REFERENCE_IMAGE\"
            }
        ]
    }")

# Check for errors in response
if echo "$RESPONSE" | jq -e '.base_resp.status_code != 0' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.base_resp.status_msg // "Unknown error"')
    log_error "Image generation failed: $ERROR_MSG"
    exit 1
fi

# Extract image URL
IMAGE_URL=$(echo "$RESPONSE" | jq -r '.data.image_urls[0] // empty')

if [ -z "$IMAGE_URL" ]; then
    log_error "Failed to extract image URL from response"
    echo "Response: $RESPONSE"
    exit 1
fi

log_info "Image generated successfully!"
log_info "URL (valid for 24h): $IMAGE_URL"

# Send via OpenClaw
log_info "Sending to channel: $CHANNEL"

if [ "$USE_CLI" = true ]; then
    # Use OpenClaw CLI
    openclaw message send \
        --action send \
        --channel "$CHANNEL" \
        --message "$CAPTION" \
        --media "$IMAGE_URL"
else
    # Direct API call to local gateway
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

    HEADERS="-H \"Content-Type: application/json\""
    if [ -n "$GATEWAY_TOKEN" ]; then
        HEADERS="$HEADERS -H \"Authorization: Bearer $GATEWAY_TOKEN\""
    fi

    curl -s -X POST "$GATEWAY_URL/message" \
        -H "Content-Type: application/json" \
        ${GATEWAY_TOKEN:+-H "Authorization: Bearer $GATEWAY_TOKEN"} \
        -d "{
            \"action\": \"send\",
            \"channel\": \"$CHANNEL\",
            \"message\": \"$CAPTION\",
            \"media\": \"$IMAGE_URL\"
        }"
fi

log_info "Done! Image sent to $CHANNEL"

# Output JSON for programmatic use
echo ""
echo "--- Result ---"
jq -n \
    --arg url "$IMAGE_URL" \
    --arg channel "$CHANNEL" \
    --arg prompt "$PROMPT" \
    '{
        success: true,
        image_url: $url,
        channel: $channel,
        prompt: $prompt
    }'
