import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";
import { decodeOAuthState } from "@/lib/oauth-state";
import {
  exchangeAuthorizationCode,
  fetchZendeskOrgDisplayName,
  zendeskTokenExpiresAtIso,
} from "@/lib/zendesk/oauth";

export const ORG_COOKIE = "korva_org_id";

export async function completeZendeskOAuth(params: {
  code: string;
  state: string;
}): Promise<NextResponse> {
  const { subdomain } = decodeOAuthState(params.state);
  const tokens = await exchangeAuthorizationCode({
    subdomain,
    code: params.code,
  });
  const profile = await fetchZendeskOrgDisplayName({
    subdomain,
    accessToken: tokens.access_token,
  });
  const tokenExpiresAt = zendeskTokenExpiresAtIso(tokens.expires_in);
  const companyName = profile.name ?? profile.subdomain ?? subdomain;

  const supabase = createSupabaseAdmin();

  const { data: existing } = await supabase
    .from("organisations")
    .select("id")
    .eq("zendesk_subdomain", subdomain)
    .maybeSingle();

  let orgId: string;

  if (existing?.id) {
    orgId = existing.id;
    const { error } = await supabase
      .from("organisations")
      .update({
        company_name: companyName,
        zendesk_access_token: tokens.access_token,
        zendesk_refresh_token: tokens.refresh_token,
        zendesk_token_expires_at: tokenExpiresAt,
      })
      .eq("id", orgId);
    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("organisations")
      .insert({
        zendesk_subdomain: subdomain,
        company_name: companyName,
        zendesk_access_token: tokens.access_token,
        zendesk_refresh_token: tokens.refresh_token,
        zendesk_token_expires_at: tokenExpiresAt,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Failed to create organisation");
    }
    orgId = inserted.id;
  }

  const base = getAppUrl();
  const res = NextResponse.redirect(new URL("/setup", base));
  res.cookies.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
