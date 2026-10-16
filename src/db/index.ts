import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Db = NodePgDatabase;

const globalForDb = globalThis as typeof globalThis & {
  __orcaPgPool?: Pool;
  __orcaDrizzleDb?: Db;
};
const scopedPools = new WeakMap<object, Pool>();
const scopedDbs = new WeakMap<object, Db>();

type RuntimeDbConfig = { scope: object | null; connectionString: string | null };
function usableUrl(v: string | undefined): string | null {
  const url = v?.trim();
  return url && !url.includes("<") && !url.includes(">") && !url.includes("example.com") ? url : null;
}

/** Tự động nhận diện chuỗi kết nối từ biến môi trường chuẩn hoặc do Google Cloud SQL / AI Studio inject */
function resolveConnectionString(): string | null {
  const direct =
    usableUrl(process.env.DATABASE_URL) ??
    usableUrl(process.env.DATABASE_URL_UNPOOLED) ??
    usableUrl(process.env.POSTGRES_URL) ??
    usableUrl(process.env.CLOUD_SQL_DATABASE_URL);
  if (direct) return direct;

  // Hỗ trợ Cloud SQL cấu hình riêng lẻ (Unix socket hoặc Host/Port nội bộ)
  const user = process.env.DB_USER ?? process.env.POSTGRES_USER;
  const pass = process.env.DB_PASS ?? process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME ?? process.env.POSTGRES_DATABASE ?? "app_db";
  const socketPath =
    process.env.DB_SOCKET_PATH ??
    (process.env.CLOUD_SQL_CONNECTION_NAME ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}` : undefined);

  if (socketPath && user) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@localhost/${encodeURIComponent(dbName)}?host=${encodeURIComponent(socketPath)}`;
  }

  const host = process.env.DB_HOST ?? process.env.POSTGRES_HOST;
  if (host && user) {
    const port = process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? "5432";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@${host}:${port}/${encodeURIComponent(dbName)}`;
  }

  return null;
}

function runtimeDbConfig(): RuntimeDbConfig {
  return { scope: null, connectionString: resolveConnectionString() };
}

/** Is a database URL configured? Lets ops endpoints report honestly without throwing. */
export function databaseConfigured(): boolean {
  return runtimeDbConfig().connectionString !== null;
}

function createMockPool(): Pool {
  console.warn("[AI Studio] Database not connected — using mock Pool");
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    }),
    on: () => {},
    end: async () => {},
  } as unknown as Pool;
}

function createMockDb(): Db {
  console.warn("[AI Studio] Database not connected — using mock Drizzle client");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };

  const createChainable = (isInsert = false): any => {
    const chain: any = () => chain;
    const defaultResult = isInsert ? [{ id: "mock_" + Date.now() }] : [];
    const promise = Promise.resolve(defaultResult);

    return new Proxy(chain, {
      get(_target, prop) {
        if (prop === "then") return promise.then.bind(promise);
        if (prop === "catch") return promise.catch.bind(promise);
        if (prop === "finally") return promise.finally.bind(promise);
        if (prop === "returning") {
          return () => Promise.resolve([{ id: "mock_" + Date.now() }]);
        }
        return createChainable(isInsert);
      },
      apply() {
        return createChainable(isInsert);
      },
    });
  };

  return new Proxy({} as Db, {
    get(_target, prop) {
      if (prop === "query") {
        return new Proxy({}, { get: () => noOp });
      }
      if (prop === "insert") {
        return () => createChainable(true);
      }
      if (prop === "execute") {
        return async () => ({ rows: [], rowCount: 0 });
      }
      return createChainable(false);
    },
  });
}

/** Real `pg` Pool or mock when DATABASE_URL is not configured or connection fails */
export function getPool(): Pool {
  const config = runtimeDbConfig();
  if (config.scope) {
    const existing = scopedPools.get(config.scope);
    if (existing) return existing;
    const pool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: 6,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 2_500,
          statement_timeout: 4_000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 5_000,
        })
      : createMockPool();
    scopedPools.set(config.scope, pool);
    return pool;
  }
  if (!globalForDb.__orcaPgPool) {
    globalForDb.__orcaPgPool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: 16,
          min: 2,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 5_000,
          statement_timeout: 10_000,
        })
      : createMockPool();
  }
  return globalForDb.__orcaPgPool;
}

/** Real Drizzle client or mock when DATABASE_URL is not configured */
export function getDb(): Db {
  const config = runtimeDbConfig();
  if (config.scope) {
    const existing = scopedDbs.get(config.scope);
    if (existing) return existing;
    let instance: Db;
    try { instance = config.connectionString ? drizzle(getPool()) : createMockDb(); }
    catch { instance = createMockDb(); }
    scopedDbs.set(config.scope, instance);
    return instance;
  }
  if (!globalForDb.__orcaDrizzleDb) {
    try { globalForDb.__orcaDrizzleDb = config.connectionString ? drizzle(getPool()) : createMockDb(); }
    catch { globalForDb.__orcaDrizzleDb = createMockDb(); }
  }
  return globalForDb.__orcaDrizzleDb;
}

/**
 * Forward every property access to the lazily-created instance, binding methods
 * to it so `db.select()…`, `db.execute(sql)` and `pool.query(sql)` behave
 * exactly as the real objects would.
 */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = resolve();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, prop) {
      return Reflect.has(resolve(), prop);
    },
    set(_target, prop, value) {
      return Reflect.set(resolve(), prop, value);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}

/** Back-compat export: `import { pool } from "@/db"` keeps working. */
export const pool: Pool = lazy<Pool>(() => getPool());

/** Back-compat export: `import { db } from "@/db"` keeps working. */
export const db: Db = lazy<Db>(() => getDb());
