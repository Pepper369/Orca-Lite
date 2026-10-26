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
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");

      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
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
      }
    }
  }

  const response = NextResponse.next();

  // Defense-in-depth headers applied at Edge
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

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
