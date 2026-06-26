import Anthropic from '@anthropic-ai/sdk';
import { aiAvailable, getAnthropicAuthToken, getAnthropicBaseURL, getAnthropicKey } from './config.js';

let cached: Anthropic | null = null;

/**
 * Returns a configured Anthropic client, or null when no credentials are set (offline mode).
 * Supports both direct Anthropic (ANTHROPIC_API_KEY) and an Anthropic-compatible proxy such as
 * the TR LiteLLM gateway (ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN → bearer auth).
 */
export function getClient(): Anthropic | null {
  if (!aiAvailable()) return null;
  if (!cached) {
    const key = getAnthropicKey();
    const authToken = getAnthropicAuthToken();
    const baseURL = getAnthropicBaseURL();
    cached = new Anthropic({
      ...(key ? { apiKey: key } : {}),
      ...(authToken ? { authToken } : {}),
      ...(baseURL ? { baseURL } : {}),
    });
  }
  return cached;
}

/** Extract the first tool-use block's input from a Messages response. */
export function firstToolInput<T>(msg: Anthropic.Message): T | null {
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return block ? (block.input as T) : null;
}

/** Human-readable description of where Vera calls go (proxy vs direct). */
export function describeTransport(): string {
  const base = getAnthropicBaseURL();
  return base ? `LiteLLM/proxy → ${base}` : 'Anthropic API (direct)';
}

/**
 * Wrap a Vera call with request/response/failure logging so it's obvious whether a call
 * actually reached the model or fell back. Re-throws on failure (the caller does the fallback).
 */
export async function callVera<T>(purpose: string, model: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.log(`[vera] → SENDING  ${purpose} · model=${model} · ${describeTransport()}`);
  try {
    const result = await fn();
    console.log(`[vera] ✓ SUCCESS  ${purpose} · ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const status = e?.status ? `HTTP ${e.status} · ` : '';
    console.warn(`[vera] ✗ FAILED   ${purpose} · ${Date.now() - started}ms · ${status}${e?.message ?? String(err)} → using deterministic fallback`);
    throw err;
  }
}
