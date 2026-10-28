import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Public endpoints that legitimately accept external webhooks or cross-origin callbacks
const CSRF_EXEMPT_PATHS = [
  "/api/v1/auth/firebase",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF Origin/Referer verification on state-mutating API requests
  if (pathname.startsWith("/api/") && MUTATION_METHODS.has(req.method)) {
    const isExempt = CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    if (!isExempt) {
      const origin = req.headers.get("origin");
      const referer = req.headers.get("referer");
      const host = req.headers.get("host") || req.nextUrl.host;

      // Allowlist of trusted server hosts: never trust unverified x-forwarded-host blindly
      const allowedHosts = new Set<string>();
      if (host) allowedHosts.add(host.toLowerCase());
      if (req.nextUrl.host) allowedHosts.add(req.nextUrl.host.toLowerCase());
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
      if (siteUrl) {
        try {
          allowedHosts.add(new URL(siteUrl).host.toLowerCase());
        } catch {}
      }

      const isHostMatch = (targetHost: string) =>
        allowedHosts.has(targetHost.toLowerCase());

      if (origin) {
        try {
          const originHost = new URL(origin).host;
          if (!isHostMatch(originHost)) {
            return new NextResponse(
              JSON.stringify({
                success: false,
                error: {
                  code: "CROSS_ORIGIN_FORBIDDEN",
                  message: "Yêu cầu khác nguồn gốc (Cross-Origin) bị từ chối vì lý do an toàn bảo mật.",
                },
              }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        } catch {
          return new NextResponse(
            JSON.stringify({
              success: false,
              error: {
                code: "INVALID_ORIGIN",
                message: "Header Origin không hợp lệ.",
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      } else if (referer) {
        try {
          const refererHost = new URL(referer).host;
          if (!isHostMatch(refererHost)) {
            return new NextResponse(
              JSON.stringify({
                success: false,
                error: {
                  code: "CROSS_ORIGIN_FORBIDDEN",
                  message: "Yêu cầu từ trang giới thiệu khác nguồn (Cross-Origin Referer) bị từ chối.",
                },
              }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        } catch {
          return new NextResponse(
            JSON.stringify({
              success: false,
              error: {
                code: "INVALID_REFERER",
                message: "Header Referer không hợp lệ.",
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }
    }
  }

  const response = NextResponse.next();

  // Defense-in-depth headers applied at Edge
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff|woff2)$).*)",
  ],
};
