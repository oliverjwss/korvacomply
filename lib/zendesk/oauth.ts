import { requireEnv } from "@/lib/env";

const ZENDESK_SCOPE = "read write";

/** Zendesk sometimes omits `expires_in` or sends a string. Avoid Invalid Date → toISOString() crash. */
export function zendeskTokenExpiresAtIso(expiresIn: unknown): string | null {
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const d = new Date(Date.now() + seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function getZendeskOAuthRedirectUri(): string {
  const base = requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  return `${base}/api/auth/zendesk/callback`;
}

function parseTokenGrantResponse(
  raw: unknown,
  options: { requireRefreshToken: boolean }
): {
  access_token: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type: string;
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Zendesk token response was not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const access =
    typeof o.access_token === "string" ? o.access_token.trim() : "";
  const refreshRaw = o.refresh_token;
  const refresh =
    typeof refreshRaw === "string" ? refreshRaw.trim() : undefined;
  if (!access) {
    throw new Error("Zendesk token response missing access_token");
  }
  if (options.requireRefreshToken && !refresh) {
    throw new Error("Zendesk token response missing refresh_token");
  }
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: o.expires_in as number | string | undefined,
    token_type:
      typeof o.token_type === "string" ? o.token_type : "bearer",
  };
}

export async function exchangeAuthorizationCode(params: {
  subdomain: string;
  code: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in?: number | string;
  token_type: string;
}> {
  const clientId = requireEnv("ZENDESK_CLIENT_ID");
  const clientSecret = requireEnv("ZENDESK_CLIENT_SECRET");
  const redirectUri = getZendeskOAuthRedirectUri();

  const res = await fetch(
    `https://${params.subdomain}.zendesk.com/oauth/tokens`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: params.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        scope: ZENDESK_SCOPE,
        // Explicit lifetimes — Zendesk docs: no default expires_in; omitting can yield unusable tokens.
        expires_in: 86400,
        refresh_token_expires_in: 2592000,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendesk token exchange failed: ${res.status} ${text}`);
  }

  const raw: unknown = await res.json();
  const parsed = parseTokenGrantResponse(raw, { requireRefreshToken: true });
  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token!,
    expires_in: parsed.expires_in,
    token_type: parsed.token_type,
  };
}

export async function refreshAccessToken(params: {
  subdomain: string;
  refresh_token: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type: string;
}> {
  const clientId = requireEnv("ZENDESK_CLIENT_ID");
  const clientSecret = requireEnv("ZENDESK_CLIENT_SECRET");

  const res = await fetch(
    `https://${params.subdomain}.zendesk.com/oauth/tokens`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: params.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendesk token refresh failed: ${res.status} ${text}`);
  }

  const raw: unknown = await res.json();
  return parseTokenGrantResponse(raw, { requireRefreshToken: false });
}

/** Best-effort display name after OAuth. Prefer Support API OAuth client (not Connections-only). */
export async function fetchZendeskOrgDisplayName(params: {
  subdomain: string;
  accessToken: string;
}): Promise<{ name?: string; subdomain?: string }> {
  const headers = {
    Authorization: `Bearer ${params.accessToken}`,
    Accept: "application/json",
  };

  const meRes = await fetch(
    `https://${params.subdomain}.zendesk.com/api/v2/users/me.json`,
    { headers }
  );
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      user?: { name?: string };
    };
    if (me.user?.name) {
      return { name: me.user.name, subdomain: params.subdomain };
    }
  }

  const acctRes = await fetch(
    `https://${params.subdomain}.zendesk.com/api/v2/account.json`,
    { headers }
  );
  if (acctRes.ok) {
    const data = (await acctRes.json()) as {
      account?: { name?: string; subdomain?: string };
    };
    return data.account ?? {};
  }

  const errText = await acctRes.text();
  throw new Error(
    `Zendesk API rejected the access token (check OAuth client is under Support → APIs → OAuth clients, not Connections-only). ` +
      `users/me: ${meRes.status}, account: ${acctRes.status} ${errText}`
  );
}
