import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgIdFromCookie } from "@/lib/setup-org";

export async function GET() {
  const orgId = await getOrgIdFromCookie();
  if (!orgId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("organisations")
    .select(
      "id, zendesk_subdomain, company_name, fca_firm_reference, regulated_activities, subscription_tier, setup_completed, zendesk_field_mapping, complaint_group_ids, created_at"
    )
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({ organisation: data });
}

export async function PATCH(request: NextRequest) {
  const orgId = await getOrgIdFromCookie();
  if (!orgId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as {
    regulated_activities?: string[];
    complaint_group_ids?: number[];
    setup_completed?: boolean;
    fca_firm_reference?: string | null;
    company_name?: string;
  };

  const patch: Record<string, unknown> = {};
  if (body.regulated_activities !== undefined) {
    patch.regulated_activities = body.regulated_activities;
  }
  if (body.complaint_group_ids !== undefined) {
    patch.complaint_group_ids = body.complaint_group_ids;
  }
  if (body.setup_completed !== undefined) {
    patch.setup_completed = body.setup_completed;
  }
  if (body.fca_firm_reference !== undefined) {
    patch.fca_firm_reference = body.fca_firm_reference;
  }
  if (body.company_name !== undefined) {
    patch.company_name = body.company_name;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("organisations")
    .update(patch)
    .eq("id", orgId)
    .select(
      "id, zendesk_subdomain, company_name, fca_firm_reference, regulated_activities, setup_completed, zendesk_field_mapping, complaint_group_ids"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organisation: data });
}
