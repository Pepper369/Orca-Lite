import "server-only";
import { recordFailure, recordSuccess } from "../health";
import { eventBus } from "../events";
import { getVpsQuotes } from "../providers/vps";

/**
 * Realtime price feed — kết nối WebSocket trực tiếp từ sàn qua VPS Socket.IO feed (100% public, live).
 * wss://bgdatafeed.vps.com.vn/socket.io/?EIO=4&transport=websocket
 * Hỗ trợ tự động fallback REST snapshot qua getVpsQuotes để đảm bảo tick luôn tươi mới.
 */

const PROVIDER = "vndirect-ws";
const VPS_WS_HOST = "wss://bgdatafeed.vps.com.vn/socket.io/?EIO=4&transport=websocket";
const DEFAULT_URL = VPS_WS_HOST;
const SILENT_MS = 45_000;
const SILENT_MS_SESSION = 25_000;
const SILENT_MS_OFFHOURS = 90_000;
const HANDSHAKE_MS = 6_000;
const RETRY_BUDGET = 32;
const BUDGET_COOLDOWN_MS = 15_000;
const URGENT_MS = 40;
const WATCHDOG_MS = 4_000;

const MI_CODE_MAP: Record<string, string> = {
  "10": "VNINDEX",
  "11": "VN30",
  "12": "HNX30",
  "13": "VNXALL",
  "02": "HNX",
  "03": "UPCOM",
  "20": "VNINDEX",
  "21": "VN30",
};
const CORE_MI_IDS = ["10", "11", "02", "03", "12"];

export type VndirectWsState = "open" | "connecting" | "closed" | "disabled" | "retrying";
type FailKind = "network" | "handshake" | "silent" | "rate_limit" | "unknown";

export interface VndirectLiveQuote {
  symbol: string;
  price: number;
  volume: number;
  value: number;
  open: number | null;
  high: number | null;
  low: number | null;
  changePercent?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  matchQtty: number | null;
  eventTime: number;
  source: "SP" | "BA";
}

export interface VndirectLiveIndex {
  code: string;
  value: number;
  change: number | null;
  volume: number | null;
  valueTraded: number | null;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  eventTime: number;
}

export interface VndirectWsStats {
  enabled: boolean;
  state: VndirectWsState;
  connectedAt: number | null;
  lastMessageAt: number | null;
  messagesPerMin: number;
  reconnectAttempts: number;
  lastError: string | null;
  lastFailKind: FailKind | null;
  nextRetryAt: number | null;
  symbolsTracked: number;
  quotesTracked: number;
  indicesTracked: number;
}

type WsLike = {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: ((e: { code?: number; reason?: string }) => void) | null;
  close: () => void;
  send: (data: string) => void;
  readyState?: number;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(String(v).replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

function wsUrl(): string {
  const env = process.env.VNDIRECT_WS_URL?.trim();
  if (env) return env;
  return DEFAULT_URL;
}

function isVnSessionWindow(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false;
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  return (mins >= 8 * 60 + 45 && mins <= 11 * 60 + 45) || (mins >= 12 * 60 + 45 && mins <= 15 * 60 + 15);
}

function classifyFail(reason: string): FailKind {
  const m = reason.toLowerCase();
  if (m.includes("429") || m.includes("rate") || m.includes("throttl") || m.includes("quota")) return "rate_limit";
  if (m.includes("handshake") || m.includes("protocol")) return "handshake";
  if (m.includes("silent")) return "silent";
  if (m.includes("timeout") || m.includes("econn") || m.includes("network") || m.includes("socket") || m.includes("closed") || m.includes("close") || m.includes("reset") || m.includes("websocket error")) return "network";
  return "unknown";
}

function computeBackoffMs(kind: FailKind, attempt: number, inSession: boolean): number {
  const table: Record<FailKind, { base: number; max: number; expCap: number }> = {
    network: { base: 60, max: inSession ? 4_000 : 15_000, expCap: 7 },
    handshake: { base: 100, max: inSession ? 5_000 : 15_000, expCap: 6 },
    silent: { base: 120, max: inSession ? 6_000 : 20_000, expCap: 6 },
    rate_limit: { base: 5_000, max: 90_000, expCap: 4 },
    unknown: { base: 200, max: inSession ? 10_000 : 25_000, expCap: 6 },
  };
  const cfg = table[kind];
  const n = Math.min(Math.max(attempt, 1), cfg.expCap);
  if (kind !== "rate_limit" && n <= 3) {
    if (n === 1) return 15 + Math.floor(Math.random() * 35);
    if (n === 2) return 40 + Math.floor(Math.random() * 80);
    return 80 + Math.floor(Math.random() * 120);
  }
  const ceiling = Math.min(cfg.base * 2 ** (n - 1), cfg.max);
  return Math.max(Math.floor(cfg.base / 2), Math.floor(ceiling * (0.35 + Math.random() * 0.65)));
}

class VndirectWsEngine {
  private started = false;
  private state: VndirectWsState = "closed";
  private ws: WsLike | null = null;
  private connectGen = 0;
  private closeGen = 0;
  private connecting = false;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private reconnectAttempts = 0;
  private lastError: string | null = null;
  private lastFailKind: FailKind | null = null;
  private nextRetryAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private secBuckets = new Int16Array(60);
  private secBase = Math.floor(Date.now() / 1000);
  private symbolRefs = new Map<string, number>();
  private quotes = new Map<string, VndirectLiveQuote>();
  private indices = new Map<string, VndirectLiveIndex>();
  private miSubscribed = false;
  private forceOn = false;

  forceEnable(on = true) {
    this.forceOn = on;
    if (on && (this.state === "closed" || this.state === "disabled")) void this.connect();
  }

  private enabled(): boolean {
    if (this.forceOn) return true;
    if (process.env.VNDIRECT_WS_DISABLED === "true") return false;
    return true;
  }

  watchSymbol(symbol: string): () => void {
    const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!s) return () => {};
    const n = (this.symbolRefs.get(s) ?? 0) + 1;
    this.symbolRefs.set(s, n);
    if (n === 1 && this.state === "open") this.sendSubscribe(["regs"], [s]);

    // Eager seed từ REST snapshot để UI lập tức có giá chuẩn
    if (!this.quotes.has(s)) {
      void getVpsQuotes([s])
        .then((qs) => {
          if (qs[0] && qs[0].price > 0) {
            const q0 = qs[0];
            const liveQ: VndirectLiveQuote = {
              symbol: s,
              price: q0.price,
              volume: q0.volume ?? 0,
              value: q0.quoteVolume ?? 0,
              open: q0.open,
              high: q0.high,
              low: q0.low,
              ceiling: q0.ceilingPrice,
              floor: q0.floorPrice,
              matchQtty: null,
              eventTime: Date.now(),
              source: "SP",
            };
            this.quotes.set(s, liveQ);
            eventBus.emit(`vndirect:quote:${s}`, {
              symbol: s,
              price: q0.price,
              volume: q0.volume ?? 0,
              value: q0.quoteVolume ?? 0,
              eventTime: liveQ.eventTime,
              ts: liveQ.eventTime,
            });
            eventBus.emit(`market-tick:${s}`, {
              symbol: s,
              price: q0.price,
              cumVolume: q0.volume ?? 0,
              cumQuoteVolume: q0.quoteVolume ?? 0,
              ts: liveQ.eventTime,
              source: "vps-rest",
              degraded: false,
            });
          }
        })
        .catch(() => {});
    }

    if (this.state !== "open" && this.state !== "connecting") this.reconnectUrgent("watchSymbol");
    return () => {
      const left = (this.symbolRefs.get(s) ?? 1) - 1;
      if (left <= 0) this.symbolRefs.delete(s);
      else this.symbolRefs.set(s, left);
    };
  }

  ensureCoreIndices() {
    if (this.state === "open" && !this.miSubscribed) {
      this.sendSubscribe(["regs"], CORE_MI_IDS);
      this.miSubscribed = true;
    }
  }

  getQuote(symbol: string, maxAgeMs = 45_000): VndirectLiveQuote | null {
    const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const q = this.quotes.get(s);
    if (!q || Date.now() - q.eventTime > maxAgeMs) {
      void getVpsQuotes([s])
        .then((qs) => {
          if (qs[0] && qs[0].price > 0) {
            const q0 = qs[0];
            this.quotes.set(s, {
              symbol: s,
              price: q0.price,
              volume: q0.volume ?? 0,
              value: q0.quoteVolume ?? 0,
              open: q0.open,
              high: q0.high,
              low: q0.low,
              ceiling: q0.ceilingPrice,
              floor: q0.floorPrice,
              matchQtty: null,
              eventTime: Date.now(),
              source: "SP",
            });
          }
        })
        .catch(() => {});
    }
    return q && Date.now() - q.eventTime <= maxAgeMs ? q : null;
  }

  getIndex(code: string, maxAgeMs = 45_000): VndirectLiveIndex | null {
    const idx = this.indices.get(code.toUpperCase());
    return idx && Date.now() - idx.eventTime <= maxAgeMs ? idx : null;
  }

  getStats(): VndirectWsStats {
    return {
      enabled: this.enabled(),
      state: this.state,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      messagesPerMin: this.msgsPerMin(),
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      lastFailKind: this.lastFailKind,
      nextRetryAt: this.nextRetryAt,
      symbolsTracked: this.symbolRefs.size,
      quotesTracked: this.quotes.size,
      indicesTracked: this.indices.size,
    };
  }

  start() {
    if (this.started) {
      if (this.state === "closed" || this.state === "disabled") void this.connect();
      return;
    }
    this.started = true;
    void this.connect();
    this.watchdog = setInterval(() => this.checkLiveness(), WATCHDOG_MS);
    this.watchdog.unref?.();
  }

  private noteMsg(now = Date.now()) {
    this.lastMessageAt = now;
    const sec = Math.floor(now / 1000);
    if (sec !== this.secBase) {
      const drift = Math.min(60, Math.max(0, sec - this.secBase));
      for (let i = 1; i <= drift; i++) this.secBuckets[(this.secBase + i) % 60] = 0;
      this.secBase = sec;
    }
    this.secBuckets[sec % 60] += 1;
  }

  private msgsPerMin(now = Date.now()): number {
    const sec = Math.floor(now / 1000);
    let sum = 0;
    for (let i = 0; i < 60; i++) if (sec - i >= this.secBase - 59) sum += this.secBuckets[(sec - i) % 60] ?? 0;
    return sum;
  }

  private hardClose() {
    ++this.closeGen;
    const ws = this.ws;
    this.ws = null;
    this.miSubscribed = false;
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch {
      /* */
    }
  }

  private clearRetryTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRetryAt = null;
  }

  private async connect() {
    if (!this.enabled()) {
      this.state = "disabled";
      return;
    }
    if (this.connecting) return;
    const WSImpl = (globalThis as unknown as { WebSocket?: new (url: string) => WsLike }).WebSocket;
    if (!WSImpl) {
      this.state = "disabled";
      this.lastError = "no native WebSocket in runtime";
      return;
    }
    this.connecting = true;
    this.state = "connecting";
    this.clearRetryTimer();
    const gen = ++this.connectGen;
    this.hardClose();

    try {
      const url = wsUrl();
      const ws = new WSImpl(url);
      this.ws = ws;
      const myCloseGen = this.closeGen;

      const handshakeTimer = setTimeout(() => {
        if (gen !== this.connectGen) return;
        if (this.state === "connecting") {
          this.lastError = "handshake timeout";
          try {
            ws.close();
          } catch {
            this.failAndReconnect("handshake timeout");
          }
        }
      }, HANDSHAKE_MS);
      handshakeTimer.unref?.();

      ws.onopen = () => {
        if (gen !== this.connectGen) return;
        clearTimeout(handshakeTimer);
        // Note: Socket.IO protocol sends 0{"sid":...} first, then client sends 40
      };

      ws.onmessage = (e) => {
        if (gen !== this.connectGen) return;
        clearTimeout(handshakeTimer);
        this.noteMsg();
        this.handleMessage(typeof e.data === "string" ? e.data : String(e.data ?? ""));
      };

      ws.onerror = () => {
        if (gen !== this.connectGen || myCloseGen !== this.closeGen) return;
        clearTimeout(handshakeTimer);
        if (this.state === "connecting") this.failAndReconnect("websocket error");
      };

      ws.onclose = (ev) => {
        if (gen !== this.connectGen || myCloseGen !== this.closeGen) return;
        clearTimeout(handshakeTimer);
        this.connecting = false;
        this.ws = null;
        this.miSubscribed = false;
        this.failAndReconnect(`closed ${ev.code ?? ""} ${ev.reason ?? ""}`.trim() || "closed");
      };
    } catch (err) {
      this.connecting = false;
      this.failAndReconnect(err instanceof Error ? err.message : "connect failed");
    }
  }

  private resubscribeAll() {
    const codes = Array.from(new Set([...CORE_MI_IDS, ...this.symbolRefs.keys()]));
    if (codes.length) {
      this.sendSubscribe(["regs"], codes);
    }
    this.miSubscribed = true;
  }

  private sendSubscribe(_types: string[], codes: string[]) {
    if (!this.ws || this.state !== "open" || !codes.length) return;
    try {
      this.ws.send('42["regs",' + JSON.stringify(JSON.stringify(codes)) + ']');
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : "subscribe send failed";
    }
  }

  private handleMessage(raw: string) {
    if (!raw) return;

    // Socket.IO / Engine.IO protocol
    if (raw === "2") {
      try {
        this.ws?.send("3");
      } catch {
        /* */
      }
      return;
    }

    if (raw.startsWith("0")) {
      try {
        this.ws?.send("40");
      } catch {
        /* */
      }
      return;
    }

    if (raw.startsWith("40")) {
      this.connecting = false;
      this.state = "open";
      this.connectedAt = Date.now();
      this.lastMessageAt = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.lastFailKind = null;
      recordSuccess(PROVIDER, 0, "realtime");
      this.resubscribeAll();
      return;
    }

    if (raw.startsWith("42")) {
      try {
        const parsed = JSON.parse(raw.slice(2));
        if (Array.isArray(parsed) && parsed.length >= 2) {
          const event = parsed[0];
          const payload = parsed[1];
          if (event === "index" && payload?.data) {
            this.handleVpsIndex(payload.data as Record<string, unknown>);
          } else if ((event === "stock" || event === "board" || event === "spt") && payload?.data) {
            this.handleVpsStock(payload.data as Record<string, unknown>);
          }
        }
      } catch {
        /* ignore parse errors */
      }
      return;
    }

    // Fallback for legacy format if any
    let obj: { type?: string; data?: unknown };
    try {
      obj = JSON.parse(raw) as { type?: string; data?: unknown };
    } catch {
      return;
    }
    const type = String(obj.type ?? "").toUpperCase();
    const dataStr = typeof obj.data === "string" ? obj.data : null;
    if (!dataStr) return;
    const parts = dataStr.split("|");
    if (type === "SP") this.onStockPartial(parts);
    else if (type === "BA") this.onBidAsk(parts);
    else if (type === "MI") this.onMarketInfo(parts);
  }

  private handleVpsIndex(d: Record<string, unknown>) {
    const mc = String(d.mc ?? "").trim();
    const code =
      MI_CODE_MAP[mc] ??
      (mc === "10" ? "VNINDEX" : mc === "11" ? "VN30" : mc === "02" ? "HNX" : mc === "03" ? "UPCOM" : null);
    if (!code) return;
    const val = num(d.cIndex);
    if (val == null || val <= 0) return;

    const ot = typeof d.ot === "string" ? d.ot.split("|") : [];
    const change = num(ot[0]);
    const adv = num(ot[3]);
    const unc = num(ot[4]);
    const dec = num(ot[5]);

    const idx: VndirectLiveIndex = {
      code,
      value: val,
      change,
      volume: num(d.vol),
      valueTraded: num(d.value) != null ? Number(d.value) * 1_000_000 : null,
      advances: adv,
      declines: dec,
      unchanged: unc,
      eventTime: Date.now(),
    };
    this.indices.set(code, idx);

    eventBus.emit(`vndirect:index:${code}`, {
      code,
      symbol: code,
      price: idx.value,
      value: idx.value,
      volume: idx.volume ?? 0,
      eventTime: idx.eventTime,
      ts: idx.eventTime,
    });
    eventBus.emit(`market-tick:${code}`, {
      symbol: code,
      price: idx.value,
      cumVolume: idx.volume ?? 0,
      cumQuoteVolume: idx.valueTraded ?? 0,
      ts: idx.eventTime,
      source: "vps-ws",
      degraded: false,
    });
  }

  private handleVpsStock(d: Record<string, unknown>) {
    const sym = String(d.sym ?? d.stock_code ?? d.stockCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym) return;
    const price = num(d.lastPrice ?? d.last_price);
    if (price == null || price <= 0) return;

    const q: VndirectLiveQuote = {
      symbol: sym,
      price,
      volume: Math.max(0, num(d.lot ?? d.totalVol ?? d.total_vol) ?? 0),
      value: Math.max(0, num(d.totalVal ?? d.total_val) ?? 0),
      open: num(d.openPrice ?? d.open_price),
      high: num(d.highPrice ?? d.high_price),
      low: num(d.lowPrice ?? d.low_price),
      ceiling: num(d.c ?? d.ceilingPrice),
      floor: num(d.f ?? d.floorPrice),
      matchQtty: num(d.lastVolume ?? d.last_volume),
      eventTime: Date.now(),
      source: "SP",
    };
    this.quotes.set(sym, q);

    eventBus.emit(`vndirect:quote:${sym}`, {
      symbol: sym,
      price: q.price,
      volume: q.volume,
      value: q.value,
      eventTime: q.eventTime,
      ts: q.eventTime,
    });
    eventBus.emit(`market-tick:${sym}`, {
      symbol: sym,
      price: q.price,
      cumVolume: q.volume,
      cumQuoteVolume: q.value,
      ts: q.eventTime,
      source: "vps-ws",
      degraded: false,
    });
  }

  private onStockPartial(arr: string[]) {
    if (arr.length < 12) return;
    const symbol = String(arr[3] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol) return;
    const price = num(arr[11]) ?? num(arr[10]);
    if (price == null || price <= 0) return;
    const q: VndirectLiveQuote = {
      symbol,
      price,
      volume: Math.max(0, num(arr[12]) ?? 0),
      value: Math.max(0, num(arr[18]) ?? 0),
      open: num(arr[9]),
      high: num(arr[13]),
      low: num(arr[14]),
      matchQtty: num(arr[12]),
      eventTime: Date.now(),
      source: "SP",
    };
    this.quotes.set(symbol, q);
    eventBus.emit(`vndirect:quote:${symbol}`, {
      symbol,
      price: q.price,
      volume: q.volume,
      value: q.value,
      eventTime: q.eventTime,
      ts: q.eventTime,
    });
  }

  private onBidAsk(arr: string[]) {
    if (arr.length < 16) return;
    const symbol = String(arr[1] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol) return;
    const price = num(arr[15]);
    if (price == null || price <= 0) return;
    const prev = this.quotes.get(symbol);
    const q: VndirectLiveQuote = {
      symbol,
      price,
      volume: Math.max(0, num(arr[14]) ?? 0),
      value: Math.max(0, num(arr[17]) ?? 0),
      open: prev?.open ?? null,
      high: prev?.high ?? null,
      low: prev?.low ?? null,
      matchQtty: num(arr[16]),
      eventTime: Date.now(),
      source: "BA",
    };
    this.quotes.set(symbol, q);
    eventBus.emit(`vndirect:quote:${symbol}`, {
      symbol,
      price: q.price,
      volume: q.volume,
      value: q.value,
      eventTime: q.eventTime,
      ts: q.eventTime,
    });
  }

  private onMarketInfo(arr: string[]) {
    if (arr.length < 13) return;
    const marketId = String(arr[0] ?? "").trim();
    const code = (MI_CODE_MAP[marketId] ?? String(arr[11] ?? "").toUpperCase()).replace(/[^A-Z0-9]/g, "");
    if (!code) return;
    const value = num(arr[12]) ?? num(arr[7]);
    if (value == null || value <= 0) return;
    const idx: VndirectLiveIndex = {
      code,
      value,
      change: num(arr[8]),
      volume: num(arr[2]) ?? num(arr[16]),
      valueTraded: num(arr[3]),
      advances: num(arr[4]),
      declines: num(arr[5]),
      unchanged: num(arr[6]),
      eventTime: Date.now(),
    };
    this.indices.set(code, idx);
    eventBus.emit(`vndirect:index:${code}`, {
      code,
      symbol: code,
      price: idx.value,
      value: idx.value,
      volume: idx.volume ?? 0,
      eventTime: idx.eventTime,
      ts: idx.eventTime,
    });
  }

  private checkLiveness() {
    if (!this.enabled()) return;
    if (this.state === "open") {
      const last = this.lastMessageAt ?? this.connectedAt ?? 0;
      const inSession = isVnSessionWindow();
      const silentLimit = inSession ? SILENT_MS_SESSION : SILENT_MS_OFFHOURS;
      const limit = !inSession && this.symbolRefs.size > 0 ? Math.min(silentLimit, SILENT_MS) : silentLimit;
      if (Date.now() - last > limit) this.failAndReconnect("silent timeout");
      return;
    }
    if (this.state === "closed" && !this.connecting && !this.timer && this.started) {
      this.scheduleReconnect(computeBackoffMs("network", this.reconnectAttempts || 1, isVnSessionWindow()));
    }
  }

  private reconnectUrgent(_why: string) {
    if (!this.enabled() || this.connecting || this.state === "open") return;
    this.scheduleReconnect(URGENT_MS + Math.floor(Math.random() * 40), true);
  }

  private scheduleReconnect(delayMs: number, _urgent = false) {
    if (!this.enabled()) {
      this.clearRetryTimer();
      this.state = "disabled";
      return;
    }
    const target = Date.now() + delayMs;
    if (this.timer && this.nextRetryAt != null) {
      if (this.nextRetryAt <= target) return;
      this.clearRetryTimer();
    }
    this.state = "retrying";
    this.nextRetryAt = target;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextRetryAt = null;
      void this.connect();
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  private failAndReconnect(reason: string) {
    this.connecting = false;
    const kind = classifyFail(reason);
    this.lastFailKind = kind;
    this.lastError = reason.slice(0, 240);
    this.state = "closed";
    recordFailure(PROVIDER, this.lastError, "realtime");
    this.hardClose();
    if (!this.enabled()) {
      this.clearRetryTimer();
      this.state = "disabled";
      return;
    }
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > RETRY_BUDGET) {
      const cooldown = isVnSessionWindow() ? BUDGET_COOLDOWN_MS : BUDGET_COOLDOWN_MS * 2;
      this.clearRetryTimer();
      this.state = "retrying";
      this.nextRetryAt = Date.now() + cooldown;
      this.timer = setTimeout(() => {
        this.reconnectAttempts = 0;
        this.timer = null;
        this.nextRetryAt = null;
        void this.connect();
      }, cooldown);
      this.timer.unref?.();
      return;
    }
    this.scheduleReconnect(computeBackoffMs(kind, this.reconnectAttempts, isVnSessionWindow()));
  }
}

// Engine singleton
const getEngine = (): VndirectWsEngine => {
  const g = globalThis as typeof globalThis & { __orcaVndirectWs?: VndirectWsEngine };
  if (!g.__orcaVndirectWs) g.__orcaVndirectWs = new VndirectWsEngine();
  return g.__orcaVndirectWs;
};

export const vndirectWs = getEngine();

export function ensureVndirectWsStarted() {
  if (process.env.VNDIRECT_WS_DISABLED === "true") return;
  vndirectWs.start();
  vndirectWs.ensureCoreIndices();
}
