import { NextRequest, NextResponse } from "next/server";
import { completeZendeskOAuth } from "@/lib/zendesk/oauth-flow";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json(
      { error: "code and state are required" },
      { status: 400 }
    );
  }
  try {
    return await completeZendeskOAuth({ code, state });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
