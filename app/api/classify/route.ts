import { NextRequest, NextResponse } from "next/server";
import { classifyRequestSchema } from "@/lib/classification/zod-schema";
import { runClassification } from "@/lib/classification/run-classifier";
import {
  getOrgForSidebarRequest,
  requireSubdomainHeader,
} from "@/lib/sidebar/verify-org";

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

  const parsed = classifyRequestSchema.safeParse(body);
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

  try {
    const result = await runClassification({
      regulatedActivities: org.regulated_activities,
      zendesk_ticket_id: parsed.data.zendesk_ticket_id,
      subject: parsed.data.subject,
      description: parsed.data.description,
      recent_comments: parsed.data.recent_comments,
      existing_tags: parsed.data.existing_tags,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Classification failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
