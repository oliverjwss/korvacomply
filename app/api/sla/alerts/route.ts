import { NextRequest, NextResponse } from "next/server";
import { getProductAreaOptions } from "@/lib/complaint-taxonomy";
import {
  computeSlaDeadline,
  computeSlaStatusProgress,
  daysRemainingUntilDeadline,
  pickSlaType,
} from "@/lib/sla";
import {
  getOrgForSidebarRequest,
  requireSubdomainHeader,
} from "@/lib/sidebar/verify-org";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { SLAAlertItem } from "@/types/comply";

function productAreaLabel(
  regulatedActivities: string[] | null,
  value: string
): string {
  const opts = getProductAreaOptions(regulatedActivities);
  return opts.find((o) => o.value === value)?.name ?? value;
}

export async function GET(request: NextRequest) {
  const subdomain = requireSubdomainHeader(request);
  if (!subdomain) {
    return NextResponse.json(
      { error: "Missing X-Zendesk-Subdomain header" },
      { status: 400 }
    );
  }

  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const org = await getOrgForSidebarRequest({
    orgId,
    zendeskSubdomain: subdomain,
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organisation not found or subdomain mismatch" },
      { status: 403 }
    );
  }

  const supabase = createSupabaseAdmin();
  const { data: openRows, error: openErr } = await supabase
    .from("complaints")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_complaint", true)
    .is("resolved_at", null);

  if (openErr) {
    return NextResponse.json({ error: openErr.message }, { status: 500 });
  }

  const now = new Date();
  const acts = org.regulated_activities ?? [];
  const breached: SLAAlertItem[] = [];
  const at_risk: SLAAlertItem[] = [];
  let on_track_count = 0;

  for (const row of openRows ?? []) {
    const receivedAt = new Date(String(row.received_at));
    if (Number.isNaN(receivedAt.getTime())) continue;

    const psrEx = Boolean(
      (row as { psr_exceptional_circumstances?: boolean })
        .psr_exceptional_circumstances
    );
    const category = String(row.final_category ?? "");
    const productArea = String(row.final_product_area ?? "");

    const slaType = pickSlaType({
      regulatedActivities: acts,
      category,
      productArea,
      psrExceptionalCircumstances: psrEx,
    });
    const deadline = computeSlaDeadline(receivedAt, slaType);
    const status = computeSlaStatusProgress(receivedAt, deadline, now);
    const days_remaining = daysRemainingUntilDeadline(deadline, now);

    const item: SLAAlertItem = {
      complaint_id: String(row.id),
      zendesk_ticket_id: Number(row.zendesk_ticket_id),
      zendesk_ticket_url: String(row.zendesk_ticket_url),
      requester_name:
        row.requester_name != null && String(row.requester_name).trim()
          ? String(row.requester_name).trim()
          : "—",
      product_area: productAreaLabel(acts, productArea),
      sla_deadline: deadline.toISOString().slice(0, 10),
      days_remaining,
      sla_type: slaType,
    };

    if (status === "breached") breached.push(item);
    else if (status === "at_risk") at_risk.push(item);
    else on_track_count++;
  }

  breached.sort((a, b) => a.days_remaining - b.days_remaining);
  at_risk.sort((a, b) => a.days_remaining - b.days_remaining);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const { data: resolvedRows, error: resErr } = await supabase
    .from("complaints")
    .select("received_at, resolved_at, sla_met")
    .eq("org_id", orgId)
    .eq("is_complaint", true)
    .not("resolved_at", "is", null)
    .gte("resolved_at", thirtyDaysAgo.toISOString());

  if (resErr) {
    return NextResponse.json({ error: resErr.message }, { status: 500 });
  }

  let met = 0;
  let totalResolved = 0;
  let sumDays = 0;

  for (const r of resolvedRows ?? []) {
    const rec = new Date(String(r.received_at));
    const res = new Date(String(r.resolved_at));
    if (Number.isNaN(rec.getTime()) || Number.isNaN(res.getTime())) continue;
    totalResolved++;
    const days = Math.max(
      0,
      Math.round((res.getTime() - rec.getTime()) / 86_400_000)
    );
    sumDays += days;
    if (r.sla_met === true) met++;
  }

  const sla_compliance_30d =
    totalResolved > 0 ? Math.round((met / totalResolved) * 1000) / 10 : 0;
  const avg_days_to_resolution =
    totalResolved > 0 ? Math.round((sumDays / totalResolved) * 10) / 10 : 0;

  const origin = request.nextUrl.origin;
  const dashboard_url = `${origin}/dashboard`;

  const body: import("@/types/comply").SLAAlerts = {
    breached,
    at_risk,
    on_track_count,
    total_open: (openRows ?? []).length,
    sla_compliance_30d,
    avg_days_to_resolution,
    dashboard_url,
  };

  return NextResponse.json(body);
}
