import { cookies } from "next/headers";
import { ORG_COOKIE } from "@/lib/zendesk/oauth-flow";

export async function getOrgIdFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ORG_COOKIE)?.value ?? null;
}
