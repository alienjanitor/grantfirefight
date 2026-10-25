import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";

// Server-side fallback re-runs a declined request on Anthropic's recommended
// model for that refusal category instead of returning the refusal.
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

export class AiUnavailableError extends Error {
  constructor() {
    super("The AI coach isn't configured. Set the ANTHROPIC_API_KEY secret to turn it on.");
  }
}

export class AiResponseError extends Error {}

export function claude(env: Env): { client: Anthropic; model: string } {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  return {
    client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    model: env.CLAUDE_MODEL || DEFAULT_MODEL,
  };
}

export function aiConfigured(env: Env): boolean {
  return !!env.ANTHROPIC_API_KEY;
}

// A short message for the chief; details go to the logs.
export function describeAiError(err: unknown): string {
  if (err instanceof AiUnavailableError || err instanceof AiResponseError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "The AI service is busy. Wait a minute and try again.";
  if (err instanceof Anthropic.AuthenticationError) return "The AI service rejected the API key. Check the ANTHROPIC_API_KEY secret.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Try again.";
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? "unknown"}). Try again.`;
  return "Something went wrong talking to the AI service. Try again.";
}
