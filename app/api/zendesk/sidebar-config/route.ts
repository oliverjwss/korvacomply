import { NextRequest, NextResponse } from "next/server";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SUBCATEGORIES,
  getProductAreaOptions,
} from "@/lib/complaint-taxonomy";
import {
  getOrgForSidebarRequest,
  requireSubdomainHeader,
} from "@/lib/sidebar/verify-org";

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
    return NextResponse.json({ error: "org_id query required" }, { status: 400 });
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

  const productAreas = getProductAreaOptions(org.regulated_activities);

  return NextResponse.json({
    org_id: org.id,
    regulated_activities: org.regulated_activities,
    field_mapping: org.zendesk_field_mapping ?? {},
    taxonomy: {
      categories: COMPLAINT_CATEGORIES,
      subcategories_by_category: COMPLAINT_SUBCATEGORIES,
      product_areas: productAreas,
    },
  });
}
