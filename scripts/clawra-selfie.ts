/**
 * MiniMax to OpenClaw Integration
 *
 * Generates images using MiniMax's image-01 model
 * and sends them to messaging channels via OpenClaw.
 *
 * Usage:
 *   npx ts-node clawra-selfie.ts "<prompt>" "<channel>" ["<caption>"]
 *
 * Environment variables:
 *   MINIMAX_API_KEY - Your MiniMax API key
 *   OPENCLAW_GATEWAY_URL - OpenClaw gateway URL (default: http://localhost:18789)
 *   OPENCLAW_GATEWAY_TOKEN - Gateway auth token (optional)
 */

import { exec } from "child_process";
import { promisify } from "util";

// Fixed reference image
const REFERENCE_IMAGE = "https://cdn.jsdelivr.net/gh/FIngerFrings/clawra_minimax@main/assets/clawra.png";

const execAsync = promisify(exec);

// Types
interface MiniMaxInput {
  prompt: string;
  aspect_ratio?: AspectRatio;
}

interface MiniMaxResponse {
  base_resp: {
    status_code: number;
    status_msg: string;
  };
  data?: {
    image_urls: string[];
  };
}

interface OpenClawMessage {
  action: "send";
  channel: string;
  message: string;
  media?: string;
}

type AspectRatio =
  | "1:1"
  | "16:9"
  | "4:3"
  | "3:2"
  | "2:3"
  | "3:4"
  | "9:16"
  | "21:9";

interface GenerateAndSendOptions {
  prompt: string;
  channel: string;
  caption?: string;
  aspectRatio?: AspectRatio;
  useClaudeCodeCLI?: boolean;
}

interface Result {
  success: boolean;
  imageUrl: string;
  channel: string;
  prompt: string;
}

/**
 * Generate image using MiniMax image-01
 */
async function generateImage(
  input: MiniMaxInput
): Promise<MiniMaxResponse> {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MINIMAX_API_KEY environment variable not set. Get your key from https://platform.minimaxi.com/user-center/basic-information/interface-key"
    );
  }

  const response = await fetch("https://api.minimaxi.com/v1/image_generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "image-01",
      prompt: input.prompt,
      aspect_ratio: input.aspect_ratio || "1:1",
      response_format: "url",
      subject_reference: [
        {
          type: "character",
          image_file: REFERENCE_IMAGE
        }
      ]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP request failed: ${response.status} - ${errorText}`);
  }

  const result: MiniMaxResponse = await response.json();

  if (result.base_resp.status_code !== 0) {
    throw new Error(`Image generation failed: ${result.base_resp.status_msg}`);
  }

  return result;
}

/**
 * Send image via OpenClaw
 */
async function sendViaOpenClaw(
  message: OpenClawMessage,
  useCLI: boolean = true
): Promise<void> {
  if (useCLI) {
    // Use OpenClaw CLI
    const cmd = `openclaw message send --action send --channel "${message.channel}" --message "${message.message}" --media "${message.media}"`;
    await execAsync(cmd);
    return;
  }

  // Direct API call
  const gatewayUrl =
    process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (gatewayToken) {
    headers["Authorization"] = `Bearer ${gatewayToken}`;
  }

  const response = await fetch(`${gatewayUrl}/message`, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenClaw send failed: ${error}`);
  }
}

/**
 * Main function: Generate image and send to channel
 */
async function generateAndSend(options: GenerateAndSendOptions): Promise<Result> {
  const {
    prompt,
    channel,
    caption = "Generated with MiniMax image-01",
    aspectRatio = "1:1",
    useClaudeCodeCLI = true,
  } = options;

  console.log(`[INFO] Generating image with MiniMax image-01...`);
  console.log(`[INFO] Prompt: ${prompt}`);
  console.log(`[INFO] Aspect ratio: ${aspectRatio}`);

  // Generate image
  const imageResult = await generateImage({
    prompt,
    aspect_ratio: aspectRatio,
  });

  if (!imageResult.data || !imageResult.data.image_urls || imageResult.data.image_urls.length === 0) {
    throw new Error("No image URL returned from the API.");
  }

  const imageUrl = imageResult.data.image_urls[0];
  console.log(`[INFO] Image generated: ${imageUrl}`);

  // Send via OpenClaw
  console.log(`[INFO] Sending to channel: ${channel}`);

  await sendViaOpenClaw(
    {
      action: "send",
      channel,
      message: caption,
      media: imageUrl,
    },
    useClaudeCodeCLI
  );

  console.log(`[INFO] Done! Image sent to ${channel}`);

  return {
    success: true,
    imageUrl,
    channel,
    prompt,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npx ts-node clawra-selfie.ts <prompt> <channel> [caption] [aspect_ratio]

Arguments:
  prompt        - Image description (required)
  channel       - Target channel (required) e.g., #general, @user
  caption       - Message caption (default: 'Generated with MiniMax image-01')
  aspect_ratio  - Image ratio (default: 1:1) Options: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9

Environment:
  MINIMAX_API_KEY - Your MiniMax API key (required)

Example:
  MINIMAX_API_KEY=your_key npx ts-node clawra-selfie.ts "A cyberpunk city" "#art" "Check this out!"
`);
    process.exit(1);
  }

  const [prompt, channel, caption, aspectRatio] = args;

  try {
    const result = await generateAndSend({
      prompt,
      channel,
      caption,
      aspectRatio: aspectRatio as AspectRatio,
    });

    console.log("\n--- Result ---");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }
}

// Export for module use
export {
  generateImage,
  sendViaOpenClaw,
  generateAndSend,
  MiniMaxInput as GrokImagineInput, // kept for backwards compat wrapper if needed, changing exported names might break dependents
  MiniMaxResponse,
  OpenClawMessage,
  GenerateAndSendOptions,
  Result,
};

// Run if executed directly
if (require.main === module) {
  main();
}
