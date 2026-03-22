import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type OrgForSidebar = {
  id: string;
  zendesk_subdomain: string;
  regulated_activities: string[] | null;
  zendesk_field_mapping: Record<string, number> | null;
};

export async function getOrgForSidebarRequest(params: {
  orgId: string;
  zendeskSubdomain: string;
}): Promise<OrgForSidebar | null> {
  const subdomain = params.zendeskSubdomain.trim().toLowerCase();
  if (!subdomain || !params.orgId) {
    return null;
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("organisations")
    .select("id, zendesk_subdomain, regulated_activities, zendesk_field_mapping")
    .eq("id", params.orgId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const orgSub = String(data.zendesk_subdomain ?? "")
    .trim()
    .toLowerCase();
  if (orgSub !== subdomain) {
    return null;
  }

  return {
    id: data.id,
    zendesk_subdomain: data.zendesk_subdomain,
    regulated_activities: data.regulated_activities as string[] | null,
    zendesk_field_mapping:
      (data.zendesk_field_mapping as Record<string, number> | null) ?? null,
  };
}

export function requireSubdomainHeader(request: Request): string | null {
  const h =
    request.headers.get("x-zendesk-subdomain") ??
    request.headers.get("X-Zendesk-Subdomain");
  return h?.trim() || null;
}
