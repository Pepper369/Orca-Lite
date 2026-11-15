"use client";

/**
 * Local-First In-Memory & IndexedDB Cache Engine for ORCA Terminal.
 * Guarantees 0ms instant paint when navigating between stocks, modules, and tabs.
 * Survives component unmounting and browser restarts.
 */

type Entry = { at: number; payload: unknown; hits: number };

const MAX_ENTRIES = 512;
const DEFAULT_TTL_MS = 600_000; // 10 minutes
const STICKY_TTL_MS = 1_800_000; // 30 minutes
const store = new Map<string, Entry>();

const STICKY_PREFIXES = [
  "/api/v1/market/",
  "/api/v1/stocks",
  "/api/v1/crypto",
  "/api/v1/forex",
  "/api/v1/commodities",
  "/api/v1/news",
  "/api/v1/macro-economic",
  "/api/v1/currency-interest-rate",
  "/api/v1/derivatives",
  "/api/v1/screener",
  "/api/v1/reports",
  "/api/v1/watchlist",
  "/api/v1/portfolio",
];

function isSticky(key: string): boolean {
  return STICKY_PREFIXES.some((p) => key === p || key.startsWith(p));
}

function ttlFor(key: string, maxAgeMs?: number): number {
  if (maxAgeMs != null) return maxAgeMs;
  return isSticky(key) ? STICKY_TTL_MS : DEFAULT_TTL_MS;
}

// Lightweight IndexedDB wrapper for persistent offline/instant cold-start cache
const DB_NAME = "orca_terminal_cache";
const STORE_NAME = "api_cache";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<Entry | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const st = tx.objectStore(STORE_NAME);
      const req = st.get(key);
      req.onsuccess = () => resolve(req.result as Entry | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, entry: Entry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const st = tx.objectStore(STORE_NAME);
    st.put(entry, key);
  } catch {
    // Ignore idb storage errors gracefully
  }
}

// Asynchronously warm in-memory cache from IndexedDB on startup
if (typeof window !== "undefined") {
  setTimeout(async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, "readonly");
      const st = tx.objectStore(STORE_NAME);
      const req = st.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = cursor.key as string;
          const entry = cursor.value as Entry;
          if (entry && Date.now() - entry.at < ttlFor(key)) {
            if (!store.has(key)) {
              store.set(key, entry);
            }
          }
          cursor.continue();
        }
      };
    } catch {
      /* ignore */
    }
  }, 100);
}

function trim() {
  if (store.size <= MAX_ENTRIES) return;
  const ordered = [...store.entries()].sort((a, b) => {
    const stickyA = isSticky(a[0]) ? 1 : 0;
    const stickyB = isSticky(b[0]) ? 1 : 0;
    if (stickyA !== stickyB) return stickyA - stickyB;
    if (a[1].hits !== b[1].hits) return a[1].hits - b[1].hits;
    return a[1].at - b[1].at;
  });
  const drop = ordered.slice(0, store.size - MAX_ENTRIES);
  for (const [k] of drop) store.delete(k);
}

export function clientCacheGet<T>(key: string, maxAgeMs?: number): T | undefined {
  const e = store.get(key);
  if (e) {
    if (Date.now() - e.at > ttlFor(key, maxAgeMs)) {
      store.delete(key);
      return undefined;
    }
    e.hits += 1;
    return e.payload as T;
  }
  return undefined;
}

export function clientCacheSet(key: string, payload: unknown) {
  const prev = store.get(key);
  const entry: Entry = { at: Date.now(), payload, hits: (prev?.hits ?? 0) + 1 };
  store.set(key, entry);
  trim();
  // Asynchronously persist sticky keys to IndexedDB for instant load on revisit
  if (isSticky(key)) {
    void idbSet(key, entry);
  }
}

export function clientCachePeekAge(key: string): number | null {
  const e = store.get(key);
  if (!e) return null;
  return Date.now() - e.at;
}

export function clientCacheHas(key: string, maxAgeMs?: number): boolean {
  return clientCacheGet(key, maxAgeMs) !== undefined;
}

/** In-flight warm requests to prevent duplicate concurrent network fetches. */
const inFlightWarm = new Set<string>();

/** Warm cache without blocking UI — used on nav hover/intent. */
export function clientCacheWarm(url: string, timeoutMs = 8_000): void {
  if (typeof window === "undefined") return;
  if (inFlightWarm.has(url) || clientCacheHas(url, 60_000)) return;
  inFlightWarm.add(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  void fetch(url, {
    headers: { Accept: "application/json" },
    signal: ctrl.signal,
    cache: "no-store",
  })
    .then((res) => res.json().catch(() => null))
    .then((json) => {
      if (json && typeof json === "object" && (json as { success?: boolean }).success) {
        clientCacheSet(url, json);
      }
    })
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer);
      inFlightWarm.delete(url);
    });
}
