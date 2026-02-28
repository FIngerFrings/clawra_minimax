---
name: clawra-selfie
description: Generate Clawra selfies with MiniMax image-01 and send to messaging channels via OpenClaw
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(openclaw:*) Bash(curl:*) Read Write WebFetch
---

# Clawra Selfie

Generate images using MiniMax's image-01 model and distribute them across messaging platforms (WhatsApp, Telegram, Discord, Slack, etc.) via OpenClaw.

## Reference Image

The skill conceptually uses a fixed reference appearance:
(For MiniMax, this is handled via prompting or `subject_reference` parameter in advanced usages. Currently we generate directly from prompt.)

```
https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png
```

## When to Use

- User says "send a pic", "send me a pic", "send a photo", "send a selfie"
- User says "send a pic of you...", "send a selfie of you..."
- User asks "what are you doing?", "how are you doing?", "where are you?"
- User describes a context: "send a pic wearing...", "send a pic at..."
- User wants Clawra to appear in a specific outfit, location, or situation

## Quick Reference

### Required Environment Variables

```bash
MINIMAX_API_KEY=your_minimax_key  # Get from https://platform.minimaxi.com/user-center/basic-information/interface-key
OPENCLAW_GATEWAY_TOKEN=your_token  # From: openclaw doctor --generate-gateway-token
```

### Workflow

1. **Get user prompt** for how to generate the image
2. **Generate image** via MiniMax API
3. **Extract image URL** from response
4. **Send to OpenClaw** with target channel(s)

## Step-by-Step Instructions

### Step 1: Collect User Input

Ask the user for:
- **User context**: What should the person in the image be doing/wearing/where?
- **Mode** (optional): `mirror` or `direct` selfie style
- **Target channel(s)**: Where should it be sent? (e.g., `#general`, `@username`, channel ID)
- **Platform** (optional): Which platform? (discord, telegram, whatsapp, slack)

## Prompt Modes

### Mode 1: Mirror Selfie (default)
Best for: outfit showcases, full-body shots, fashion content

```
make a pic of this person, but [user's context]. the person is taking a mirror selfie
```

**Example**: "wearing a santa hat" →
```
make a pic of this person, but wearing a santa hat. the person is taking a mirror selfie
```

### Mode 2: Direct Selfie
Best for: close-up portraits, location shots, emotional expressions

```
a close-up selfie taken by herself at [user's context], direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

**Example**: "a cozy cafe with warm lighting" →
```
a close-up selfie taken by herself at a cozy cafe with warm lighting, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

### Mode Selection Logic

| Keywords in Request | Auto-Select Mode |
|---------------------|------------------|
| outfit, wearing, clothes, dress, suit, fashion | `mirror` |
| cafe, restaurant, beach, park, city, location | `direct` |
| close-up, portrait, face, eyes, smile | `direct` |
| full-body, mirror, reflection | `mirror` |

### Step 2: Generate Image with MiniMax

Use the MiniMax API to generate the image:

```bash
# Mode 1: Mirror Selfie
PROMPT="make a pic of this person, but <USER_CONTEXT>. the person is taking a mirror selfie"

# Mode 2: Direct Selfie
PROMPT="a close-up selfie taken by herself at <USER_CONTEXT>, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible"

# Build JSON payload with jq (handles escaping properly)
JSON_PAYLOAD=$(jq -n \
  --arg prompt "$PROMPT" \
  '{model: "image-01", prompt: $prompt, aspect_ratio: "1:1", response_format: "url"}')

curl -X POST "https://api.minimaxi.com/v1/image_generation" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD"
```

**Response Format:**
```json
{
  "id": "...",
  "data": {
    "image_urls": [
      "https://..."
    ]
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

### Step 3: Send Image via OpenClaw

Use the OpenClaw messaging API to send the generated image:

```bash
openclaw message send \
  --action send \
  --channel "<TARGET_CHANNEL>" \
  --message "<CAPTION_TEXT>" \
  --media "<IMAGE_URL>"
```

**Alternative: Direct API call**
```bash
curl -X POST "http://localhost:18789/message" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send",
    "channel": "<TARGET_CHANNEL>",
    "message": "<CAPTION_TEXT>",
    "media": "<IMAGE_URL>"
  }'
```

## Complete Script Example

```bash
#!/bin/bash
# clawra-selfie.sh

# Check required environment variables
if [ -z "$MINIMAX_API_KEY" ]; then
  echo "Error: MINIMAX_API_KEY environment variable not set"
  exit 1
fi

# Fixed reference image
REFERENCE_IMAGE="https://cdn.jsdelivr.net/gh/FIngerFrings/clawra_minimax@main/assets/clawra.png"

USER_CONTEXT="$1"
CHANNEL="$2"
MODE="${3:-auto}"  # mirror, direct, or auto
CAPTION="${4:-Generated with MiniMax image-01}"

if [ -z "$USER_CONTEXT" ] || [ -z "$CHANNEL" ]; then
  echo "Usage: $0 <user_context> <channel> [mode] [caption]"
  echo "Modes: mirror, direct, auto (default)"
  echo "Example: $0 'wearing a cowboy hat' '#general' mirror"
  echo "Example: $0 'a cozy cafe' '#general' direct"
  exit 1
fi

# Auto-detect mode based on keywords
if [ "$MODE" == "auto" ]; then
  if echo "$USER_CONTEXT" | grep -qiE "outfit|wearing|clothes|dress|suit|fashion|full-body|mirror"; then
    MODE="mirror"
  elif echo "$USER_CONTEXT" | grep -qiE "cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile"; then
    MODE="direct"
  else
    MODE="mirror"  # default
  fi
  echo "Auto-detected mode: $MODE"
fi

# Construct the prompt based on mode
if [ "$MODE" == "direct" ]; then
  EDIT_PROMPT="a close-up selfie taken by herself at $USER_CONTEXT, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible"
else
  EDIT_PROMPT="make a pic of this person, but $USER_CONTEXT. the person is taking a mirror selfie"
fi

echo "Mode: $MODE"
echo "Generating image with prompt: $EDIT_PROMPT"

# Generate image (using jq for proper JSON escaping)
JSON_PAYLOAD=$(jq -n \
  --arg prompt "$EDIT_PROMPT" \
  --arg image_url "$REFERENCE_IMAGE" \
  '{
    model: "image-01", 
    prompt: $prompt, 
    aspect_ratio: "1:1", 
    response_format: "url",
    subject_reference: [
      {
        type: "character",
        image_file: $image_url
      }
    ]
  }')

RESPONSE=$(curl -s -X POST "https://api.minimaxi.com/v1/image_generation" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# Check status
STATUS_CODE=$(echo "$RESPONSE" | jq -r '.base_resp.status_code')
if [ "$STATUS_CODE" != "0" ]; then
  echo "Error: Failed to generate image"
  echo "Response: $RESPONSE"
  exit 1
fi

# Extract image URL
IMAGE_URL=$(echo "$RESPONSE" | jq -r '.data.image_urls[0]')

if [ "$IMAGE_URL" == "null" ] || [ -z "$IMAGE_URL" ]; then
  echo "Error: Failed to extract image from response"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Image generated: $IMAGE_URL"
echo "Sending to channel: $CHANNEL"

# Send via OpenClaw
openclaw message send \
  --action send \
  --channel "$CHANNEL" \
  --message "$CAPTION" \
  --media "$IMAGE_URL"

echo "Done!"
```

## Node.js/TypeScript Implementation

```typescript
import { exec } from "child_process";
import { promisify } from "util";

// Fixed reference image
const REFERENCE_IMAGE = "https://cdn.jsdelivr.net/gh/FIngerFrings/clawra_minimax@main/assets/clawra.png";

const execAsync = promisify(exec);

interface MiniMaxResult {
  base_resp: {
    status_code: number;
    status_msg: string;
  };
  data: {
    image_urls: string[];
  };
}

type SelfieMode = "mirror" | "direct" | "auto";

function detectMode(userContext: string): "mirror" | "direct" {
  const mirrorKeywords = /outfit|wearing|clothes|dress|suit|fashion|full-body|mirror/i;
  const directKeywords = /cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile/i;

  if (directKeywords.test(userContext)) return "direct";
  if (mirrorKeywords.test(userContext)) return "mirror";
  return "mirror"; // default
}

function buildPrompt(userContext: string, mode: "mirror" | "direct"): string {
  if (mode === "direct") {
    return `a close-up selfie taken by herself at ${userContext}, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible`;
  }
  return `make a pic of this person, but ${userContext}. the person is taking a mirror selfie`;
}

async function generateAndSend(
  userContext: string,
  channel: string,
  mode: SelfieMode = "auto",
  caption?: string
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY environment variable not set");
  }

  // Determine mode
  const actualMode = mode === "auto" ? detectMode(userContext) : mode;
  console.log(`Mode: ${actualMode}`);

  // Construct the prompt
  const editPrompt = buildPrompt(userContext, actualMode);

  // Generate image with MiniMax
  console.log(`Generating image: "${editPrompt}"`);

  const response = await fetch("https://api.minimaxi.com/v1/image_generation", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${apiKey}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "image-01",
      prompt: editPrompt,
      aspect_ratio: "1:1",
      response_format: "url",
      subject_reference: [
        {
          type: "character",
          image_file: REFERENCE_IMAGE
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(\`HTTP request failed: \${response.status}\`);
  }

  const result = await response.json() as MiniMaxResult;

  if (result.base_resp.status_code !== 0) {
    throw new Error(\`Image generation failed: \${result.base_resp.status_msg}\`);
  }

  const imageUrl = result.data.image_urls[0];
  console.log(\`Generated image URL: \${imageUrl}\`);

  // Send via OpenClaw
  const messageCaption = caption || \`Generated with MiniMax image-01\`;

  await execAsync(
    \`openclaw message send --action send --channel "\${channel}" --message "\${messageCaption}" --media "\${imageUrl}"\`
  );

  console.log(\`Sent to \${channel}\`);
  return imageUrl;
}

// Usage Examples

// Mirror mode (auto-detected from "wearing")
generateAndSend(
  "wearing a cyberpunk outfit with neon lights",
  "#art-gallery",
  "auto",
  "Check out this AI-edited art!"
);
// → Mode: mirror
// → Prompt: "make a pic of this person, but wearing a cyberpunk outfit with neon lights. the person is taking a mirror selfie"

// Direct mode (auto-detected from "cafe")
generateAndSend(
  "a cozy cafe with warm lighting",
  "#photography",
  "auto"
);
// → Mode: direct
// → Prompt: "a close-up selfie taken by herself at a cozy cafe with warm lighting, direct eye contact..."

// Explicit mode override
generateAndSend("casual street style", "#fashion", "direct");
```

## Supported Platforms

OpenClaw supports sending to:

| Platform | Channel Format | Example |
|----------|----------------|---------|
| Discord | `#channel-name` or channel ID | `#general`, `123456789` |
| Telegram | `@username` or chat ID | `@mychannel`, `-100123456` |
| WhatsApp | Phone number (JID format) | `1234567890@s.whatsapp.net` |
| Slack | `#channel-name` | `#random` |
| Signal | Phone number | `+1234567890` |
| MS Teams | Channel reference | (varies) |

## MiniMax API Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | "image-01" | Model version (e.g., image-01) |
| `prompt` | string | required | Generation instruction |
| `aspect_ratio` | enum | "1:1" | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9 |
| `response_format` | enum | "url" | Return format |

## Setup Requirements

### 1. Install OpenClaw CLI
```bash
npm install -g openclaw
```

### 2. Configure OpenClaw Gateway
```bash
openclaw config set gateway.mode=local
openclaw doctor --generate-gateway-token
```

### 3. Start OpenClaw Gateway
```bash
openclaw gateway start
```

## Error Handling

- **MINIMAX_API_KEY missing**: Ensure the API key is set in environment
- **Image generation failed**: Check prompt content, API format, and MiniMax API balance
- **OpenClaw send failed**: Verify gateway is running and channel exists

## Tips

1. **Mirror mode context examples** (outfit focus):
   - "wearing a santa hat"
   - "in a business suit"
   - "wearing a summer dress"
   - "in streetwear fashion"

2. **Direct mode context examples** (location/portrait focus):
   - "a cozy cafe with warm lighting"
   - "a sunny beach at sunset"
   - "a busy city street at night"
   - "a peaceful park in autumn"

3. **Mode selection**: Let auto-detect work, or explicitly specify for control
4. **Batch sending**: Generate once, send to multiple channels
5. **Scheduling**: Combine with OpenClaw scheduler for automated posts
