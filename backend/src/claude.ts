import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from './config.js';

let cached: Anthropic | null = null;

/** Returns a configured Anthropic client, or null when no API key is set (offline mode). */
export function getClient(): Anthropic | null {
  const key = getAnthropicKey();
  if (!key) return null;
  if (!cached) cached = new Anthropic({ apiKey: key });
  return cached;
}

/** Extract the first tool-use block's input from a Messages response. */
export function firstToolInput<T>(msg: Anthropic.Message): T | null {
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return block ? (block.input as T) : null;
}
