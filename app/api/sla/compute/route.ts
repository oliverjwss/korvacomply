import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calculateSLA,
} from "@/lib/sla-engine";
import {
  computeSlaStatusProgress,
  daysRemainingUntilDeadline,
} from "@/lib/sla-shared";
import {
  getOrgForSidebarRequest,
  requireSubdomainHeader,
} from "@/lib/sidebar/verify-org";

const bodySchema = z.object({
  org_id: z.string().uuid(),
  received_at: z.string(),
  final_category: z.string(),
  final_product_area: z.string(),
  psr_exceptional_circumstances: z.boolean().optional(),
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const org = await getOrgForSidebarRequest({
    orgId: parsed.data.org_id,
    zendeskSubdomain: subdomain,
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organisation not found or subdomain mismatch" },
      { status: 403 }
    );
  }

  const receivedAt = new Date(parsed.data.received_at);
  if (Number.isNaN(receivedAt.getTime())) {
    return NextResponse.json({ error: "Invalid received_at" }, { status: 400 });
  }

  const acts = org.regulated_activities ?? [];
  const calc = calculateSLA(
    receivedAt,
    acts,
    parsed.data.final_product_area,
    parsed.data.final_category,
    {
      psr_exceptional_circumstances:
        parsed.data.psr_exceptional_circumstances ?? false,
    }
  );

  const now = new Date();
  const status = computeSlaStatusProgress(receivedAt, calc.sla_deadline, now);
  const days_remaining = daysRemainingUntilDeadline(calc.sla_deadline, now);

  return NextResponse.json({
    sla_type: calc.sla_type,
    sla_deadline: calc.sla_deadline.toISOString().slice(0, 10),
    warning_date: calc.warning_date.toISOString(),
    critical_date: calc.critical_date.toISOString(),
    status,
    days_remaining,
  });
}
