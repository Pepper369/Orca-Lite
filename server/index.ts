import http from "node:http";
import { serve, getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureLlamaServerRunning,
  proxyToLlamaServer,
  isLlamaServerHealthy,
  cleanupAiRuntime,
} from "./ai-runtime";

dotenv.config();

const app = new Hono();

// Global Middleware
app.use("*", logger());
app.use("*", async (c, next) => {
  // Never compress SSE streaming endpoints or agent endpoints
  const accept = c.req.header("accept") || "";
  const path = c.req.path;
  if (path.startsWith("/api/v1/agent") || accept.includes("text/event-stream")) {
    return next();
  }
  return compress()(c, next);
});
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

// Unified AI Gateway & OpenAI-Compatible Endpoints on Single Port
app.all("/v1/*", proxyToLlamaServer);
app.get("/model-health", async (c) => {
  const healthy = await isLlamaServerHealthy();
  return c.json({
    status: healthy ? "ok" : "degraded",
    model: process.env.LOCAL_GGUF_MODEL || "orca-financial-qwen2.5-3b",
    backend: "llama-server C++ (loopback)",
    gatewayPort: Number(process.env.PORT || 3000),
    healthy,
    timestamp: Date.now(),
  });
});
app.get("/api/model-health", (c) => c.redirect("/model-health"));

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

// Market intelligence & snapshots direct bridges
app.get("/api/v1/market/intel", async (c) => {
  const { GET } = await import("@/app/api/v1/market/intel/route");
  return GET();
});

app.get("/api/v1/market/snapshot", async (c) => {
  const { GET } = await import("@/app/api/v1/market/snapshot/route");
  return GET();
});

app.get("/api/v1/market/global", async (c) => {
  const { GET } = await import("@/app/api/v1/market/global/route");
  return GET();
});

app.get("/api/v1/sentiment", async (c) => {
  const { GET } = await import("@/app/api/v1/sentiment/route");
  return GET(c.req.raw);
});

// Crypto detail direct bridge
app.get("/api/v1/crypto/:symbol", async (c) => {
  const symbol = c.req.param("symbol");
  if (symbol === "markets") {
    const { GET } = await import("@/app/api/v1/crypto/markets/route");
    return GET(c.req.raw);
  }
  const { GET } = await import("@/app/api/v1/crypto/[symbol]/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
});

// Forex detail direct bridge
app.get("/api/v1/forex/:symbol", async (c) => {
  const symbol = c.req.param("symbol");
  if (symbol === "markets") {
    const { GET } = await import("@/app/api/v1/forex/markets/route");
    return GET();
  }
  const { GET } = await import("@/app/api/v1/forex/[symbol]/route");
  return GET(c.req.raw, { params: Promise.resolve({ symbol }) });
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

// Earnings statutory calendar direct bridge
app.get("/api/v1/earnings/calendar", async (c) => {
  const { GET } = await import("@/app/api/v1/earnings/calendar/route");
  return GET(c.req.raw);
});

// Agent direct API bridges (SSE streaming & verify)
app.post("/api/v1/agent", async (c) => {
  const { POST } = await import("@/app/api/v1/agent/route");
  return POST(c.req.raw);
});

app.get("/api/v1/agent", async (c) => {
  const mod = await import("@/app/api/v1/agent/route");
  if (typeof mod.GET === "function") {
    return mod.GET();
  }
  return c.json({ success: true, service: "ORCA FA AI Agent", status: "ready" });
});

app.post("/api/v1/agent/verify", async (c) => {
  const { POST } = await import("@/app/api/v1/agent/verify/route");
  return POST(c.req.raw);
});

app.get("/api/v1/agent/verify", async (c) => {
  return c.json({ success: true, service: "ORCA FA AI Agent Fact Verification", status: "ready" });
});

// Universal Next.js Route Resolver with Dynamic Parameter Support
const apiBaseDir = path.resolve(process.cwd(), "src", "app", "api");
const routeCache = new Map<string, { routeFile: string; paramNames: string[] }>();
const MAX_ROUTE_CACHE_ENTRIES = 500;

function findRoute(currentDir: string, segments: string[], paramNames: string[]): { routeFile: string; paramNames: string[] } | null {
  const resolvedCurrent = path.resolve(currentDir);
  if (!resolvedCurrent.startsWith(apiBaseDir)) {
    return null;
  }

  if (segments.length === 0) {
    const directFile = path.join(currentDir, "route.ts");
    if (fs.existsSync(directFile) && path.resolve(directFile).startsWith(apiBaseDir)) {
      return { routeFile: directFile, paramNames };
    }
    return null;
  }

  const [segment, ...rest] = segments;
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
    return null;
  }

  // 1. Exact match folder
  const exactDir = path.join(currentDir, segment);
  if (path.resolve(exactDir).startsWith(apiBaseDir) && fs.existsSync(exactDir) && fs.statSync(exactDir).isDirectory()) {
    const res = findRoute(exactDir, rest, paramNames);
    if (res) return res;
  }

  // 2. Bracket match folder: [param]
  if (fs.existsSync(currentDir)) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("[") && entry.name.endsWith("]")) {
        const pName = entry.name.slice(1, -1);
        const bracketDir = path.join(currentDir, entry.name);
        if (path.resolve(bracketDir).startsWith(apiBaseDir)) {
          const res = findRoute(bracketDir, rest, [...paramNames, pName]);
          if (res) return res;
        }
      }
    }
  }

  return null;
}

// Universal API Router for all /api/* routes
app.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname.replace(/^\/api\//, "");
  const segments = pathname.split("/").filter(Boolean);

  // Security guard: Reject path traversal attempts immediately
  if (segments.some((s) => s === ".." || s === "." || s.includes("..") || s.includes("\\") || s.includes("\0"))) {
    return c.json({ success: false, error: { code: "FORBIDDEN", message: "Invalid path segments" } }, 403);
  }

  try {
    const cacheKey = segments.join("/");
    let matched = routeCache.get(cacheKey);

    if (!matched) {
      matched = findRoute(apiBaseDir, segments, []) ?? undefined;
      if (matched) {
        if (routeCache.size >= MAX_ROUTE_CACHE_ENTRIES) {
          routeCache.clear();
        }
        routeCache.set(cacheKey, matched);
      }
    }

    if (matched) {
      // Re-extract param values dynamically based on matching directories
      const params: Record<string, string> = {};
      const relPath = path.relative(apiBaseDir, path.dirname(matched.routeFile));
      const routeSegments = relPath.split(path.sep).filter(Boolean);

      routeSegments.forEach((rSeg, idx) => {
        if (rSeg.startsWith("[") && rSeg.endsWith("]") && segments[idx]) {
          const key = rSeg.slice(1, -1);
          params[key] = segments[idx];
        }
      });

      // Import handler reliably across all operating systems using file URL
      const module = await import(pathToFileURL(matched.routeFile).href);

      const method = c.req.method.toUpperCase();
      const handler = module[method];

      if (typeof handler === "function") {
        return handler(c.req.raw, { params: Promise.resolve(params) });
      }
    }
  } catch (err: any) {
    console.error(`[Hono API] Error handling /api/${pathname}:`, err);
    return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Route execution error" } }, 500);
  }

  return c.json({ success: false, error: { code: "NOT_FOUND", message: `Endpoint /api/${pathname} not found on Hono engine` } }, 404);
});

const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const hasDist = fs.existsSync(path.resolve(process.cwd(), "dist", "index.html"));

async function startUnifiedServer() {
  const honoListener = getRequestListener(app.fetch);

  // Auto-boot background local C++ AI Inference Engine if GGUF model is present
  await ensureLlamaServerRunning();

  if (isProd || (!process.env.NODE_ENV && hasDist && process.env.START_PROD === "true")) {
    // Production SPA Static File Serving via Hono
    if (hasDist) {
      app.use("/*", serveStatic({ root: "./dist" }));
      app.get("*", serveStatic({ path: "./dist/index.html" }));
    }

    serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        console.log(`\n============================================================`);
        console.log(`  ORCA FINANCIAL — ULTRA-FAST FULLSTACK TERMINAL`);
        console.log(`============================================================`);
        console.log(`  🚀 Production Server: http://localhost:${info.port}`);
        console.log(`  📦 Static SPA Bundle: ./dist`);
        console.log(`  ⚡ Fixed Single Port: ${info.port}\n`);

        // Start Fast Datafeed background worker & prewarm
        import("@/lib/services/fast-datafeed-hub")
          .then((m) => m.initFastDatafeedWorker())
          .catch((err) => console.warn("[Server] FastDatafeed worker initialization failed:", err));
      },
    );
  } else {
    // Development Mode: In-Process Vite HMR + Hono API Bridge on ONE SINGLE PORT (3000)
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    const server = http.createServer((req, res) => {
      const url = req.url || "";
      if (
        url.startsWith("/api") ||
        url.startsWith("/health") ||
        url.startsWith("/v1") ||
        url.startsWith("/model-health")
      ) {
        return honoListener(req, res);
      }
      vite.middlewares(req, res);
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(`\n============================================================`);
      console.log(`  ORCA FINANCIAL — ULTRA-FAST FULLSTACK TERMINAL`);
      console.log(`============================================================`);
      console.log(`  ⚡ Unified Server:   http://localhost:${port}`);
      console.log(`  ⚡ Mode:             Development (In-Process Vite HMR + Hono Engine)`);
      console.log(`  ⚡ Fixed Single Port: ${port} (Zero Multi-Port Confusion, No Proxy)\n`);

      // Start Fast Datafeed background worker & prewarm
      import("@/lib/services/fast-datafeed-hub")
        .then((m) => m.initFastDatafeedWorker())
        .catch((err) => console.warn("[Server] FastDatafeed worker initialization failed:", err));
    });

    const cleanup = async () => {
      console.log("\n[ORCA] Gracefully shutting down unified server...");
      cleanupAiRuntime();
      server.close();
      await vite.close();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

// Start server
startUnifiedServer().catch((err) => {
  console.error("Failed to start unified ORCA server:", err);
  process.exit(1);
});

export default app;
