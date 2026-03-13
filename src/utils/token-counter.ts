import Anthropic from "@anthropic-ai/sdk";
import { readOAuthToken } from "./oauth-token.js";
import { CHARS_PER_TOKEN_ESTIMATE } from "./constants.js";

/** Timeout for a single countTokens API call (10 seconds). */
const COUNT_TOKENS_TIMEOUT_MS = 10_000;

/** After this many consecutive failures, disable remote counting for the process. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** M-29: Time-based circuit breaker recovery (5 minutes). */
const CIRCUIT_BREAKER_RECOVERY_MS = 5 * 60 * 1000;

let cachedClient: Anthropic | null = null;
let consecutiveFailures = 0;
let remoteDisabled = false;
let disabledAt: number | null = null;

async function getClient(): Promise<Anthropic | null> {
  // M-29: Time-based circuit breaker recovery
  if (remoteDisabled) {
    if (disabledAt && Date.now() - disabledAt > CIRCUIT_BREAKER_RECOVERY_MS) {
      remoteDisabled = false;
      consecutiveFailures = 0;
      disabledAt = null;
    } else {
      return null;
    }
  }
  if (cachedClient) return cachedClient;

  const token = await readOAuthToken();
  if (!token) return null;

  cachedClient = new Anthropic({ apiKey: token });
  return cachedClient;
}

function localEstimate(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * Count the number of input tokens a prompt would use.
 *
 * Uses the Anthropic `messages.countTokens()` API (free).
 * Falls back to a character-based estimate on any failure.
 *
 * Includes a circuit breaker: after MAX_CONSECUTIVE_FAILURES failures,
 * remote counting is disabled for the rest of the process to avoid
 * repeated slow/failing network requests.
 */
export async function countPromptTokens(text: string, model: string): Promise<number> {
  try {
    const client = await getClient();
    if (!client) {
      return localEstimate(text);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COUNT_TOKENS_TIMEOUT_MS);

    try {
      const response = await client.messages.countTokens(
        {
          model,
          messages: [{ role: "user", content: text }],
        },
        { signal: controller.signal },
      );

      // Success — reset failure counter
      consecutiveFailures = 0;
      return response.input_tokens;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      remoteDisabled = true;
      disabledAt = Date.now(); // M-29: Record when disabled for recovery
    }
    // Fallback to character-based estimate
    return localEstimate(text);
  }
}

/**
 * Reset circuit breaker state (for testing).
 */
export function _resetTokenCounterState(): void {
  cachedClient = null;
  consecutiveFailures = 0;
  remoteDisabled = false;
  disabledAt = null; // M-29: Reset recovery timestamp
}
