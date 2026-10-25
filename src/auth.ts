import { createRemoteJWKSet, jwtVerify } from "jose";

// Sign-in is Cloudflare Access (one-time PIN email or an identity provider) in
// front of the Worker. The app verifies the Access JWT itself rather than
// trusting a header, then authorizes against its own users table.

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function teamOrigin(domain: string): string {
  return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

export function isLocalHost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export async function identify(request: Request, env: Env): Promise<string | null> {
  const url = new URL(request.url);
  // Local development only: the bypass can't open up a deployed Worker,
  // whose requests never arrive with a localhost host.
  if (env.DEV_AUTH_EMAIL && isLocalHost(url)) return env.DEV_AUTH_EMAIL.toLowerCase();

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;

  const issuer = teamOrigin(env.ACCESS_TEAM_DOMAIN);
  let jwks = jwksByTeam.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByTeam.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
