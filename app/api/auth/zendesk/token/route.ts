import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  refreshAccessToken,
  zendeskTokenExpiresAtIso,
} from "@/lib/zendesk/oauth";

async function parseTokenBody(request: NextRequest): Promise<{
  subdomain?: string;
  refresh_token?: string;
  org_id?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return {
      subdomain: params.get("subdomain") ?? undefined,
      refresh_token: params.get("refresh_token") ?? undefined,
      org_id: params.get("org_id") ?? undefined,
    };
  }
  return (await request.json()) as {
    subdomain?: string;
    refresh_token?: string;
    org_id?: string;
  };
}

export async function POST(request: NextRequest) {
  const body = await parseTokenBody(request);
  const { subdomain, refresh_token, org_id } = body;
  if (!subdomain || !refresh_token) {
    return NextResponse.json(
      { error: "subdomain and refresh_token are required" },
      { status: 400 }
    );
  }

  try {
    const tokens = await refreshAccessToken({ subdomain, refresh_token });
    const tokenExpiresAt = zendeskTokenExpiresAtIso(tokens.expires_in);
    if (org_id) {
      const supabase = createSupabaseAdmin();
      await supabase
        .from("organisations")
        .update({
          zendesk_access_token: tokens.access_token,
          zendesk_refresh_token: tokens.refresh_token ?? refresh_token,
          zendesk_token_expires_at: tokenExpiresAt,
        })
        .eq("id", org_id);
    }
    return NextResponse.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token refresh failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
