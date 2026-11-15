// Next.js Server compatibility shim for standalone Hono / Node environment

export class NextResponse<T = any> extends Response {
  static json<T = any>(data: T, init?: ResponseInit): NextResponse<T> {
    return Response.json(data, init) as NextResponse<T>;
  }

  static redirect(url: string | URL, status: number = 307): NextResponse {
    return Response.redirect(url, status) as NextResponse;
  }

  static rewrite(destination: string | URL, init?: ResponseInit): NextResponse {
    return new Response(null, {
      ...init,
      headers: {
        ...init?.headers,
        "x-middleware-rewrite": destination.toString(),
      },
    }) as NextResponse;
  }

  static next(): NextResponse {
    return new Response(null, {
      headers: { "x-middleware-next": "1" },
    }) as NextResponse;
  }
}

export interface NextRequest extends Request {
  nextUrl: URL;
  cookies: any;
  ip?: string;
  geo?: any;
}
