import "server-only";
import { env } from "./env";

/**
 * Rate limit theo IP cho các route tốn tiền (LLM), webhook, copytrade hoặc đăng nhập.
 *
 * Thứ tự ưu tiên backend:
 *  1. Upstash Redis REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
 *  2. Redis TCP (`REDIS_URL` qua `ioredis`)
 *  3. Bộ đếm trong bộ nhớ (`memoryAllow`) khi chưa cấu hình Redis hoặc Redis lỗi.
 */

export type LimiterBinding = "RL_AI" | "RL_AUTH";

export interface RateLimitOptions {
  /** Tên nhóm, tách bộ đếm giữa các route (vd. "agent", "login"). */
  name: string;
  /** Binding dùng khi có. */
  binding: LimiterBinding;
  /** Ngưỡng: tối đa `limit` lần mỗi `windowSec` giây. */
  limit: number;
  windowSec: number;
}

const mem = new Map<string, { count: number; resetAt: number }>();
const MEM_MAX_KEYS = 5_000;

type RedisCounterClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

let redisClient: RedisCounterClient | null = null;
let redisInitPromise: Promise<RedisCounterClient | null> | null = null;

async function getRedisClient(): Promise<RedisCounterClient | null> {
  if (redisClient) return redisClient;
  if (!env.redisUrl) return null;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    try {
      const mod = await import("ioredis");
      const client = new mod.default(env.redisUrl!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1_000,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        commandTimeout: 600,
      });
      client.on("error", () => {});
      await Promise.race([
        client.connect().catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, 1_000)),
      ]);
      const status = (client as { status?: string }).status;
      if (status === "ready" || status === "connect" || status === "connecting") {
        redisClient = client as unknown as RedisCounterClient;
        return redisClient;
      }
      try {
        client.disconnect(false);
      } catch {
        /* ignore */
      }
      return null;
    } catch {
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || "unknown";
}

function memoryAllow(key: string, limit: number, windowSec: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (mem.size > MEM_MAX_KEYS) {
    for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
    if (mem.size > MEM_MAX_KEYS) mem.clear();
  }
  const cur = mem.get(key);
  if (!cur || cur.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfter: 0 };
  }
  cur.count += 1;
  if (cur.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

function currentBucket(windowSec: number): { bucket: number; retryAfter: number } {
  const windowMs = Math.max(1, windowSec) * 1000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000));
  return { bucket, retryAfter };
}

async function upstashAllow(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number } | null> {
  if (!env.upstashRestUrl || !env.upstashRestToken) return null;
  const { bucket, retryAfter } = currentBucket(windowSec);
  const bucketKey = `rl:${key}:${bucket}`;
  const url = `${env.upstashRestUrl.replace(/\/+$/, "")}/pipeline`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.upstashRestToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", bucketKey],
      ["EXPIRE", bucketKey, Math.max(1, Math.ceil(windowSec)) + 1],
    ]),
    signal: AbortSignal.timeout(800),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ result?: number }>;
  const count = Number(data?.[0]?.result);
  if (!Number.isFinite(count)) return null;
  return count > limit ? { ok: false, retryAfter } : { ok: true, retryAfter: 0 };
}

async function redisAllow(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number } | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const { bucket, retryAfter } = currentBucket(windowSec);
  const bucketKey = `rl:${key}:${bucket}`;
  const count = await client.incr(bucketKey);
  if (count === 1) {
    await client.expire(bucketKey, Math.max(1, Math.ceil(windowSec)) + 1);
  }
  return count > limit ? { ok: false, retryAfter } : { ok: true, retryAfter: 0 };
}

/**
 * Kiểm tra giới hạn tần suất theo key với backend phân tán (Upstash / Redis) và fallback in-memory.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number; backend: "upstash" | "redis" | "memory" }> {
  try {
    const upstash = await upstashAllow(key, limit, windowSec);
    if (upstash) return { ...upstash, backend: "upstash" };
  } catch {
    /* fallback to next backend */
  }

  try {
    const redis = await redisAllow(key, limit, windowSec);
    if (redis) return { ...redis, backend: "redis" };
  } catch {
    /* fallback to memory */
  }

  const memResult = memoryAllow(key, limit, windowSec);
  return { ...memResult, backend: "memory" };
}

/**
 * Trả về `null` nếu được phép, hoặc `Response` 429 để route trả thẳng.
 * Không bao giờ ném lỗi: nếu bộ đếm phân tán gặp sự cố thì fallback về bộ đếm trong bộ nhớ.
 */
export async function rateLimit(req: Request, opts: RateLimitOptions): Promise<Response | null> {
  const key = `${opts.name}:${clientIp(req)}`;
  let allowed = true;
  let retryAfter = opts.windowSec;

  try {
    const r = await checkRateLimit(key, opts.limit, opts.windowSec);
    allowed = r.ok;
    retryAfter = r.retryAfter || opts.windowSec;
  } catch {
    allowed = true;
  }

  if (allowed) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút." },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
