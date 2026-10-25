// Bindings that wrangler.jsonc can't declare: secrets and test-only values.
// Merging into the generated base interface reaches both the global Env and
// Cloudflare.Env (what `import { env } from "cloudflare:workers"` returns).
interface __BaseEnv_Env {
  ANTHROPIC_API_KEY?: string;
  DEV_AUTH_EMAIL?: string;
  TEST_MIGRATIONS?: import("@cloudflare/vitest-plugin").D1Migration[];
}
