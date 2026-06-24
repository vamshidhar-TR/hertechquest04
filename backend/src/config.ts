export const REGISTRY_VERSION = 'v1';

export function getAnthropicKey(): string | undefined {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  return k || undefined;
}

/** Claude is optional — its absence flips the app to deterministic fallbacks. */
export function claudeAvailable(): boolean {
  return Boolean(getAnthropicKey());
}

export const MODELS = {
  /** NL → rule parsing: cheap, fast, forced tool-use. */
  parse: 'claude-sonnet-4-6',
  /** "Why this matters" explanations: most capable. */
  explain: 'claude-opus-4-8',
} as const;
