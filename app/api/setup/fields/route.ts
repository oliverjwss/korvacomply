import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgIdFromCookie } from "@/lib/setup-org";
import { provisionZendeskTicketFields } from "@/lib/zendesk/fields";

export async function POST() {
  const orgId = await getOrgIdFromCookie();
  if (!orgId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .select(
      "id, zendesk_subdomain, zendesk_access_token, regulated_activities"
    )
    .eq("id", orgId)
    .single();

  if (orgError || !org?.zendesk_access_token) {
    return NextResponse.json(
      { error: orgError?.message ?? "Missing Zendesk access token" },
      { status: 400 }
    );
  }

  try {
    const mapping = await provisionZendeskTicketFields({
      subdomain: org.zendesk_subdomain,
      accessToken: org.zendesk_access_token,
      regulatedActivities: org.regulated_activities,
    });

    const { data: updated, error: updateError } = await supabase
      .from("organisations")
      .update({ zendesk_field_mapping: mapping })
      .eq("id", orgId)
      .select("zendesk_field_mapping")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      zendesk_field_mapping: updated?.zendesk_field_mapping ?? mapping,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Field provisioning failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
