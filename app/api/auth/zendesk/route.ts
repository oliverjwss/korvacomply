import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { encodeOAuthState, randomNonce } from "@/lib/oauth-state";
import { getZendeskOAuthRedirectUri } from "@/lib/zendesk/oauth";
import { completeZendeskOAuth } from "@/lib/zendesk/oauth-flow";

export async function GET(request: NextRequest) {
  const subdomain = request.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return NextResponse.json(
      { error: "subdomain query parameter is required" },
      { status: 400 }
    );
  }
  const clientId = requireEnv("ZENDESK_CLIENT_ID");
  const redirectUri = encodeURIComponent(getZendeskOAuthRedirectUri());
  const state = encodeOAuthState({ subdomain, nonce: randomNonce() });
  const scope = encodeURIComponent("read write");
  const url = `https://${subdomain}.zendesk.com/oauth/authorizations/new?response_type=code&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${redirectUri}&scope=${scope}&state=${encodeURIComponent(state)}`;
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let code: string | undefined;
  let state: string | undefined;

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { code?: string; state?: string };
    code = body.code;
    state = body.state;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    code = String(form.get("code") ?? "");
    state = String(form.get("state") ?? "");
  } else {
    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 415 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "code and state are required" },
      { status: 400 }
    );
  }

  try {
    return await completeZendeskOAuth({ code, state });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
