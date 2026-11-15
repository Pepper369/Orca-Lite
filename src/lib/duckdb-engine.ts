"use client";

/**
 * ORCA FinTech In-Memory Analytical Data Engine (Powered by DuckDB-WASM + Apache Arrow).
 * Provides sub-millisecond local-first SQL queries and tabular calculations on client CPU.
 * Completely eliminates server roundtrips when sorting, filtering, and cross-analyzing BCTC & Screener data.
 */

import * as duckdb from "@duckdb/duckdb-wasm";

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB | null> | null = null;

// CDN bundles configuration for reliable client-side WASM execution in Next.js
const JSDELIVR_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/duckdb-mvp.wasm",
    mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/duckdb-eh.wasm",
    mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/duckdb-browser-eh.worker.js",
  },
};

/**
 * Initializes and retrieves the singleton DuckDB-WASM instance.
 */
export async function getDuckDB(): Promise<duckdb.AsyncDuckDB | null> {
  if (typeof window === "undefined") return null;
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        if (!bundle.mainWorker) return null;

        // Instantiate worker via blob to bypass cross-origin worker restriction
        const workerScript = `importScripts("${bundle.mainWorker}");`;
        const workerUrl = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
        const worker = new Worker(workerUrl);

        const logger = new duckdb.VoidLogger();
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(workerUrl);

        dbInstance = db;
        connInstance = await db.connect();
        return db;
      } catch (err) {
        console.warn("[DuckDB-Engine] Falling back to lightweight memory engine:", err);
        return null;
      }
    })();
  }

  return initPromise;
}

/**
 * Ingests a JSON array of records into an in-memory DuckDB table.
 */
export async function ingestJSONTable(tableName: string, data: Record<string, unknown>[]): Promise<boolean> {
  if (!data || data.length === 0) return false;
  const safeTableName = tableName.trim().replace(/[^a-zA-Z0-9_]/g, "_");
  if (!safeTableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(safeTableName)) {
    console.warn(`[DuckDB-Engine] Invalid table name rejected: ${tableName}`);
    return false;
  }

  try {
    const db = await getDuckDB();
    if (!db || !connInstance) return false;

    const jsonStr = JSON.stringify(data);
    await db.registerFileText(`${safeTableName}.json`, jsonStr);
    await connInstance.query(`
      CREATE OR REPLACE TABLE ${safeTableName} AS 
      SELECT * FROM read_json_auto('${safeTableName}.json');
    `);
    return true;
  } catch (err) {
    console.warn(`[DuckDB-Engine] Failed to ingest table ${tableName}:`, err);
    return false;
  }
}

/**
 * Executes an arbitrary SQL query against the in-memory DuckDB database.
 * Returns an array of standard JavaScript objects.
 */
export async function querySQL<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const db = await getDuckDB();
    if (!db || !connInstance) return [];

    const arrowTable = await connInstance.query(sql);
    const rows: T[] = [];
    const fields = arrowTable.schema.fields.map((f) => f.name);

    for (let i = 0; i < arrowTable.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const field of fields) {
        const val = arrowTable.getChild(field)?.get(i);
        row[field] = typeof val === "bigint" ? Number(val) : val;
      }
      rows.push(row as T);
    }
    return rows;
  } catch (err) {
    console.warn("[DuckDB-Engine] SQL execution failed:", err);
    return [];
  }
}

/**
 * Micro-benchmark or health check for the in-memory engine.
 */
export async function checkDuckDBHealth(): Promise<{ status: "wasm" | "fallback"; latencyMs: number }> {
  const start = performance.now();
  const db = await getDuckDB();
  if (db && connInstance) {
    await connInstance.query("SELECT 1 AS ok");
    return { status: "wasm", latencyMs: Math.round(performance.now() - start) };
  }
  return { status: "fallback", latencyMs: 0 };
}
