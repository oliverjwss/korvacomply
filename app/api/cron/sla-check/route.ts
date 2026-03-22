import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeSlaDeadline,
  computeSlaStatusProgress,
  computeThreeDayResolved,
  endOfUtcDay,
  formatDateOnly,
  pickSlaType,
} from "@/lib/sla";
import type { AuditEntry, SLAStatus } from "@/types/comply";

function requireCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data: complaints, error: qErr } = await supabase
    .from("complaints")
    .select("*")
    .eq("is_complaint", true);

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const rows = complaints ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, updated: 0 });
  }

  const orgIds = [...new Set(rows.map((r) => String(r.org_id)))];
  const { data: orgs, error: oErr } = await supabase
    .from("organisations")
    .select("id, regulated_activities")
    .in("id", orgIds);

  if (oErr) {
    return NextResponse.json({ error: oErr.message }, { status: 500 });
  }

  const orgMap = new Map(
    (orgs ?? []).map((o) => [
      String(o.id),
      (o.regulated_activities as string[] | null) ?? [],
    ])
  );

  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const orgId = String(row.org_id);
    const activities = orgMap.get(orgId) ?? [];
    const receivedAt = new Date(String(row.received_at));
    if (Number.isNaN(receivedAt.getTime())) continue;

    const psrEx = Boolean(
      (row as { psr_exceptional_circumstances?: boolean })
        .psr_exceptional_circumstances
    );
    const category = String(row.final_category ?? "");
    const productArea = String(row.final_product_area ?? "");

    const slaType = pickSlaType({
      regulatedActivities: activities,
      category,
      productArea,
      psrExceptionalCircumstances: psrEx,
    });
    const deadline = computeSlaDeadline(receivedAt, slaType);
    const slaDeadlineStr = formatDateOnly(deadline);

    const resolvedRaw = row.resolved_at;
    const resolvedAt =
      resolvedRaw != null ? new Date(String(resolvedRaw)) : null;
    const hasResolved =
      resolvedAt != null && !Number.isNaN(resolvedAt.getTime());

    let slaStatus: SLAStatus = String(row.sla_status) as SLAStatus;
    let threeDay = Boolean(row.three_day_resolved);
    let slaMet: boolean | null =
      row.sla_met === null || row.sla_met === undefined
        ? null
        : Boolean(row.sla_met);

    if (hasResolved) {
      threeDay = computeThreeDayResolved(receivedAt, resolvedAt!);
      slaMet = resolvedAt!.getTime() <= endOfUtcDay(deadline).getTime();
    } else {
      slaStatus = computeSlaStatusProgress(receivedAt, deadline);
    }

    const prevStatus = String(row.sla_status);
    const prevDeadline = String(row.sla_deadline ?? "");
    const prevType = String(row.sla_type ?? "");

    const statusChanged = !hasResolved && prevStatus !== slaStatus;
    const deadlineChanged = prevDeadline !== slaDeadlineStr;
    const typeChanged = prevType !== slaType;

    const prevLog = (row.audit_log as AuditEntry[] | null) ?? [];
    let audit_log = prevLog;
    if (statusChanged) {
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        actor: "system",
        action: "sla_status_updated",
        details: {
          from: prevStatus,
          to: slaStatus,
          zendesk_ticket_id: row.zendesk_ticket_id,
        },
      };
      audit_log = [...prevLog, entry];
    }

    if (
      !statusChanged &&
      !deadlineChanged &&
      !typeChanged &&
      row.three_day_resolved === threeDay &&
      row.sla_met === slaMet
    ) {
      continue;
    }

    const { error: uErr } = await supabase
      .from("complaints")
      .update({
        sla_type: slaType,
        sla_deadline: slaDeadlineStr,
        sla_status: slaStatus,
        three_day_resolved: threeDay,
        sla_met: slaMet,
        audit_log,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (uErr) {
      errors.push(`${row.id}: ${uErr.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    updated,
    errors: errors.length ? errors : undefined,
  });
}
