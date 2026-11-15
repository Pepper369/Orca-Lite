import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

dotenv.config();

const app = new Hono();

// Global Middleware
app.use("*", logger());
app.use("*", compress());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
    maxAge: 86400,
  }),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", engine: "Hono Ultra-Fast Engine", timestamp: Date.now() }));
app.get("/api/health", (c) => c.json({ status: "ok", engine: "Hono Ultra-Fast Engine", timestamp: Date.now() }));

// High-performance direct API bridges
app.get("/api/v1/stocks", async (c) => {
  const { GET } = await import("@/app/api/v1/stocks/route");
  return GET(c.req.raw);
});

app.get("/api/v1/stocks/:symbol", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/stocks/:symbol/financials", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/financials/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/stocks/:symbol/fundamentals", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/fundamentals/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/stocks/:symbol/valuation", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/valuation/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/stocks/:symbol/profile", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/profile/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/stocks/:symbol/orderbook", async (c) => {
  const symbol = c.req.param("symbol");
  const { GET } = await import("@/app/api/v1/stocks/[symbol]/orderbook/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

app.get("/api/v1/chart/live-quote", async (c) => {
  const { GET } = await import("@/app/api/v1/chart/live-quote/route");
  return GET(c.req.raw);
});

app.get("/api/v1/stocks/screener", async (c) => {
  const { GET } = await import("@/app/api/v1/stocks/screener/route");
  return GET(c.req.raw);
});

app.get("/api/v1/crypto/markets", async (c) => {
  const { GET } = await import("@/app/api/v1/crypto/markets/route");
  return GET(c.req.raw);
});

app.get("/api/v1/forex/markets", async (c) => {
  const { GET } = await import("@/app/api/v1/forex/markets/route");
  return GET();
});

app.get("/api/v1/commodities", async (c) => {
  const { GET } = await import("@/app/api/v1/commodities/route");
  return GET();
});

app.get("/api/v1/news", async (c) => {
  const { GET } = await import("@/app/api/v1/news/route");
  return GET(c.req.raw);
});

app.get("/api/v1/watchlist", async (c) => {
  const { GET } = await import("@/app/api/v1/watchlist/route");
  return GET(c.req.raw);
});

app.put("/api/v1/watchlist", async (c) => {
  const { PUT } = await import("@/app/api/v1/watchlist/route");
  return PUT(c.req.raw);
});

// Dynamic fallback for any other /api/* endpoints
app.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname.replace(/^\/api\//, "");
  const segments = pathname.split("/").filter(Boolean);

  try {
    const routePath = segments.join("/");
    const module = await import(`@/app/api/${routePath}/route`).catch(() => null);

    if (module) {
      const method = c.req.method.toUpperCase();
      const handler = module[method];
      if (typeof handler === "function") {
        return handler(c.req.raw);
      }
    }
  } catch (err) {
    console.error(`[Hono API] Error handling /api/${pathname}:`, err);
  }

  return c.json({ success: false, error: { code: "NOT_FOUND", message: `Endpoint /api/${pathname} not found on Hono engine` } }, 404);
});

// Production SPA Static File Serving
const hasDist = fs.existsSync(path.resolve(process.cwd(), "dist", "index.html"));
if (hasDist) {
  // Serve static assets from dist/
  app.use("/*", serveStatic({ root: "./dist" }));

  // Fallback to index.html for client-side routing on any non-asset route
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.API_PORT || process.env.PORT || 8000);

console.log(`[ORCA Hono Engine] Starting server on http://localhost:${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`🚀 [ORCA Hono Engine] High-performance API running at http://localhost:${info.port}`);
  if (hasDist) {
    console.log(`📦 [ORCA Hono Engine] Serving production SPA bundle from ./dist`);
  }
});

export default app;
