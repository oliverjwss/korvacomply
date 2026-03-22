import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Zendesk interpolates {{setting.api_url}}/zendesk/sidebar. If api_url ends with
 * "/", the path becomes //zendesk/sidebar which can 404. Collapse duplicate slashes.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.includes("//")) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = pathname.replace(/\/{2,}/g, "/");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/:path*",
};
