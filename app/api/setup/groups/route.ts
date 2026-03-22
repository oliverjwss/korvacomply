import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgIdFromCookie } from "@/lib/setup-org";
import { listGroups } from "@/lib/zendesk/client";

export async function GET() {
  const orgId = await getOrgIdFromCookie();
  if (!orgId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data: org, error } = await supabase
    .from("organisations")
    .select("zendesk_subdomain, zendesk_access_token")
    .eq("id", orgId)
    .single();

  if (error || !org?.zendesk_access_token) {
    return NextResponse.json(
      { error: error?.message ?? "Missing Zendesk access token" },
      { status: 400 }
    );
  }

  try {
    const groups = await listGroups(org.zendesk_subdomain, org.zendesk_access_token);
    return NextResponse.json({
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list groups";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
