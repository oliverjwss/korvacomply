import { NextRequest, NextResponse } from "next/server";
import { saveComplaintRequestSchema } from "@/lib/classification/zod-schema";
import {
  computeSlaDeadline,
  computeSlaStatusProgress,
  computeThreeDayResolved,
  endOfUtcDay,
  formatDateOnly,
  pickSlaType,
} from "@/lib/sla";
import {
  getOrgForSidebarRequest,
  requireSubdomainHeader,
} from "@/lib/sidebar/verify-org";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { AuditEntry, SLAStatus } from "@/types/comply";

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    org_id: row.org_id,
    zendesk_ticket_id: row.zendesk_ticket_id,
    zendesk_ticket_url: row.zendesk_ticket_url,
    requester_name: row.requester_name ?? null,
    is_complaint: row.is_complaint,
    ai_suggested_category: row.ai_suggested_category,
    ai_suggested_subcategory: row.ai_suggested_subcategory,
    ai_suggested_product_area: row.ai_suggested_product_area,
    ai_confidence: row.ai_confidence,
    ai_reasoning: row.ai_reasoning,
    final_category: row.final_category,
    final_subcategory: row.final_subcategory,
    final_product_area: row.final_product_area,
    classification_method: row.classification_method,
    classified_by: row.classified_by,
    classified_at: row.classified_at,
    received_at: row.received_at,
    sla_type: row.sla_type,
    sla_deadline: row.sla_deadline,
    resolved_at: row.resolved_at,
    sla_status: row.sla_status,
    psr_exceptional_circumstances: row.psr_exceptional_circumstances ?? false,
    sla_met: row.sla_met ?? null,
    three_day_resolved: row.three_day_resolved,
    complaint_outcome: row.complaint_outcome,
    redress_amount: row.redress_amount,
    referred_to_fos: row.referred_to_fos,
    vulnerability_detected: row.vulnerability_detected,
    vulnerability_drivers: row.vulnerability_drivers,
    vulnerability_indicators: row.vulnerability_indicators,
    vulnerability_assessment_confidence:
      row.vulnerability_assessment_confidence ?? null,
    vulnerability_recommended_action:
      row.vulnerability_recommended_action ?? null,
    vulnerability_agent_decision:
      (row.vulnerability_agent_decision as string | null) ?? null,
    vulnerability_dismissal_reason: row.vulnerability_dismissal_reason ?? null,
    consumer_duty_risk: row.consumer_duty_risk,
    consumer_duty_notes: row.consumer_duty_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    audit_log: row.audit_log,
  };
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
  const ticketId = request.nextUrl.searchParams.get("ticket_id");
  if (!orgId || !ticketId) {
    return NextResponse.json(
      { error: "org_id and ticket_id query params required" },
      { status: 400 }
    );
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

  const tid = Number(ticketId);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "Invalid ticket_id" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("org_id", orgId)
    .eq("zendesk_ticket_id", tid)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ complaint: null });
  }

  return NextResponse.json({
    complaint: mapRow(data as Record<string, unknown>),
    regulated_activities: org.regulated_activities,
  });
}

export async function POST(request: NextRequest) {
  const subdomain = requireSubdomainHeader(request);
  if (!subdomain) {
    return NextResponse.json(
      { error: "Missing X-Zendesk-Subdomain header" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveComplaintRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const b = parsed.data;

  const org = await getOrgForSidebarRequest({
    orgId: b.org_id,
    zendeskSubdomain: subdomain,
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organisation not found or subdomain mismatch" },
      { status: 403 }
    );
  }

  const receivedAt = new Date(b.received_at);
  if (Number.isNaN(receivedAt.getTime())) {
    return NextResponse.json({ error: "Invalid received_at" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: existing } = await supabase
    .from("complaints")
    .select(
      "audit_log, complaint_outcome, redress_amount, resolved_at, three_day_resolved, referred_to_fos, psr_exceptional_circumstances, requester_name, sla_met, vulnerability_agent_decision, vulnerability_dismissal_reason"
    )
    .eq("org_id", b.org_id)
    .eq("zendesk_ticket_id", b.zendesk_ticket_id)
    .maybeSingle();

  const psrExceptional =
    b.psr_exceptional_circumstances ??
    Boolean(existing?.psr_exceptional_circumstances);

  const slaType = pickSlaType({
    regulatedActivities: org.regulated_activities,
    category: b.final_category,
    productArea: b.final_product_area,
    psrExceptionalCircumstances: psrExceptional,
  });

  const deadlineDate =
    b.is_complaint ? computeSlaDeadline(receivedAt, slaType) : null;
  const slaDeadline = deadlineDate ? formatDateOnly(deadlineDate) : null;
  let slaStatus: SLAStatus = "on_track";
  if (b.is_complaint && deadlineDate) {
    slaStatus = computeSlaStatusProgress(receivedAt, deadlineDate);
  }

  const resolvedAt = existing?.resolved_at
    ? new Date(String(existing.resolved_at))
    : null;
  const threeDay =
    resolvedAt && !Number.isNaN(resolvedAt.getTime())
      ? computeThreeDayResolved(receivedAt, resolvedAt)
      : Boolean(existing?.three_day_resolved);

  let slaMet: boolean | null =
    existing?.sla_met === null || existing?.sla_met === undefined
      ? null
      : Boolean(existing.sla_met);
  if (b.is_complaint && resolvedAt && deadlineDate) {
    slaMet = resolvedAt.getTime() <= endOfUtcDay(deadlineDate).getTime();
  }

  const prevLog = (existing?.audit_log as AuditEntry[] | null) ?? [];
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    actor: b.classified_by,
    action: "classification_saved",
    details: {
      classification_method: b.classification_method,
      is_complaint: b.is_complaint,
      final_category: b.final_category,
      final_subcategory: b.final_subcategory,
      final_product_area: b.final_product_area,
      ai_suggested_category: b.ai_suggested_category,
      ai_suggested_subcategory: b.ai_suggested_subcategory,
      ai_suggested_product_area: b.ai_suggested_product_area,
      psr_exceptional_circumstances: psrExceptional,
    },
  };
  const auditEntries: AuditEntry[] = [entry];
  if (b.is_complaint && b.vulnerability_agent_decision) {
    auditEntries.push({
      timestamp: new Date().toISOString(),
      actor: b.classified_by,
      action: "vulnerability_decision",
      details: {
        decision: b.vulnerability_agent_decision,
        vulnerability_detected: b.vulnerability_detected,
        drivers: b.vulnerability_drivers,
        indicators: b.vulnerability_indicators,
        dismissal_reason:
          b.vulnerability_dismissal_reason?.trim() &&
          b.vulnerability_agent_decision === "not_vulnerable"
            ? b.vulnerability_dismissal_reason.trim()
            : null,
        ai_assessment_confidence: b.vulnerability_assessment_confidence ?? null,
      },
    });
  }
  const audit_log = [...prevLog, ...auditEntries];

  const requesterName =
    b.requester_name?.trim() ||
    (existing?.requester_name != null
      ? String(existing.requester_name)
      : null);

  const row = {
    org_id: b.org_id,
    zendesk_ticket_id: b.zendesk_ticket_id,
    zendesk_ticket_url: b.zendesk_ticket_url,
    requester_name: requesterName,
    is_complaint: b.is_complaint,
    complaint_outcome: existing?.complaint_outcome ?? null,
    redress_amount: existing?.redress_amount ?? null,
    resolved_at: existing?.resolved_at ?? null,
    three_day_resolved: threeDay,
    referred_to_fos: existing?.referred_to_fos ?? false,
    psr_exceptional_circumstances: psrExceptional,
    sla_met: slaMet,
    ai_suggested_category: b.ai_suggested_category,
    ai_suggested_subcategory: b.ai_suggested_subcategory,
    ai_suggested_product_area: b.ai_suggested_product_area,
    ai_confidence: b.ai_confidence,
    ai_reasoning: b.ai_reasoning,
    final_category: b.final_category,
    final_subcategory: b.final_subcategory,
    final_product_area: b.final_product_area,
    classification_method: b.classification_method,
    classified_by: b.classified_by,
    received_at: receivedAt.toISOString(),
    sla_type: slaType,
    sla_deadline: slaDeadline,
    sla_status: slaStatus,
    vulnerability_detected: b.vulnerability_detected,
    vulnerability_drivers: b.vulnerability_drivers,
    vulnerability_indicators: b.vulnerability_indicators,
    vulnerability_assessment_confidence:
      b.vulnerability_assessment_confidence ?? null,
    vulnerability_recommended_action:
      b.vulnerability_recommended_action?.trim() || null,
    vulnerability_agent_decision: b.is_complaint
      ? b.vulnerability_agent_decision ?? null
      : null,
    vulnerability_dismissal_reason:
      b.is_complaint && b.vulnerability_agent_decision === "not_vulnerable"
        ? (b.vulnerability_dismissal_reason ?? "").trim() || null
        : null,
    consumer_duty_risk: b.consumer_duty_risk,
    consumer_duty_notes: b.consumer_duty_notes,
    audit_log,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("complaints")
    .upsert(row, { onConflict: "org_id,zendesk_ticket_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    complaint: mapRow(saved as Record<string, unknown>),
    regulated_activities: org.regulated_activities,
  });
}
