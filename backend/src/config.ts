export const REGISTRY_VERSION = 'v1';

/** Direct Anthropic API key (x-api-key auth). */
export function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
}

/** Bearer auth token — e.g. a LiteLLM proxy virtual key (Authorization: Bearer …). */
export function getAnthropicAuthToken(): string | undefined {
  return process.env.ANTHROPIC_AUTH_TOKEN?.trim() || undefined;
}

/** Override the API host — e.g. https://litellm.int.thomsonreuters.com for the TR LiteLLM proxy. */
export function getAnthropicBaseURL(): string | undefined {
  return process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
}

/** Claude is optional — its absence flips the app to deterministic fallbacks. Either auth method counts. */
export function claudeAvailable(): boolean {
  return Boolean(getAnthropicKey() || getAnthropicAuthToken());
}

/**
 * Model ids. Through a proxy (LiteLLM) the registered name can differ from the public Anthropic id
 * and may carry a provider prefix, e.g. `anthropic/claude-opus-4-7`.
 * Precedence: per-call override → shared ANTHROPIC_MODEL → built-in default.
 */
const SHARED_MODEL = process.env.ANTHROPIC_MODEL?.trim();
export const MODELS = {
  /** NL → rule parsing: cheap, fast, forced tool-use. */
  parse: process.env.ANTHROPIC_MODEL_PARSE?.trim() || SHARED_MODEL || 'claude-sonnet-4-6',
  /** "Why this matters" explanations: most capable. */
  explain: process.env.ANTHROPIC_MODEL_EXPLAIN?.trim() || SHARED_MODEL || 'claude-opus-4-8',
};

/**
 * `temperature` param for Messages calls. Omitted by default — some newer models (and gateways
 * like LiteLLM in front of them) reject it ("temperature is deprecated for this model"). Set
 * ANTHROPIC_TEMPERATURE=0 (or any number) to send it explicitly on models that still accept it.
 */
export function temperatureParam(): { temperature?: number } {
  const raw = process.env.ANTHROPIC_TEMPERATURE?.trim();
  if (!raw) return {};
  const n = Number(raw);
  return Number.isFinite(n) ? { temperature: n } : {};
}
