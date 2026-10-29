/**
 * TradingView JS API Datafeed Adapter for Orca-Lite
 * Enables integration with TradingView Advanced Charts / Charting Library widget.
 */

export interface TvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TvSymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: "price" | "volume";
  pricescale: number;
  minmov: number;
  has_intraday: boolean;
  supported_resolutions: string[];
  intraday_multipliers: string[];
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  currency_code: string;
}

export interface TvPeriodParams {
  from: number;
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

export class TradingViewDatafeed {
  private subscribers = new Map<
    string,
    {
      symbol: string;
      resolution: string;
      callback: (bar: TvBar) => void;
      timerId?: NodeJS.Timeout;
    }
  >();

  public onReady(callback: (configuration: Record<string, unknown>) => void): void {
    fetch("/api/v1/chart/tradingview/config")
      .then((res) => res.json())
      .then((config) => callback(config))
      .catch(() => {
        callback({
          supports_search: true,
          supports_group_request: false,
          supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
          supports_marks: true,
          supports_timescale_marks: true,
          supports_time: true,
        });
      });
  }

  public async searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResultReadyCallback: (results: Array<Record<string, unknown>>) => void
  ): Promise<void> {
    try {
      const q = encodeURIComponent(userInput.trim());
      const res = await fetch(`/api/v1/chart/tradingview/search?query=${q}&type=${encodeURIComponent(symbolType)}&exchange=${encodeURIComponent(exchange)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      onResultReadyCallback(Array.isArray(data) ? data : []);
    } catch {
      onResultReadyCallback([]);
    }
  }

  public async resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: (symbolInfo: TvSymbolInfo) => void,
    onResolveErrorCallback: (reason: string) => void
  ): Promise<void> {
    try {
      const encoded = encodeURIComponent(symbolName);
      const res = await fetch(`/api/v1/chart/tradingview/symbols?symbol=${encoded}`);
      if (!res.ok) {
        throw new Error(`Cannot resolve symbol ${symbolName} (status ${res.status})`);
      }
      const data: TvSymbolInfo = await res.json();
      onSymbolResolvedCallback(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error resolving symbol";
      onResolveErrorCallback(msg);
    }
  }

  public async getBars(
    symbolInfo: TvSymbolInfo,
    resolution: string,
    periodParams: TvPeriodParams,
    onHistoryCallback: (bars: TvBar[], meta: { noData: boolean }) => void,
    onErrorCallback: (error: string) => void
  ): Promise<void> {
    try {
      const { from, to, countBack } = periodParams;
      const url = `/api/v1/chart/tradingview/history?symbol=${encodeURIComponent(symbolInfo.ticker)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}&countback=${countBack || 300}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

      const data = await res.json();
      if (data.s === "no_data" || !data.t || data.t.length === 0) {
        onHistoryCallback([], { noData: true });
        return;
      }

      if (data.s === "error") {
        throw new Error(data.errmsg || "UDF server error");
      }

      const bars: TvBar[] = [];
      for (let i = 0; i < data.t.length; i++) {
        bars.push({
          time: data.t[i] * 1000,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v[i] || 0,
        });
      }

      onHistoryCallback(bars, { noData: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load history bars";
      onErrorCallback(msg);
    }
  }

  public subscribeBars(
    symbolInfo: TvSymbolInfo,
    resolution: string,
    onRealtimeCallback: (bar: TvBar) => void,
    subscriberUID: string,
    _onResetCacheNeededCallback: () => void
  ): void {
    const symbol = symbolInfo.ticker;

    // Polling live quote every 2s to stream candle updates
    const timerId = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/chart/live-quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const json = await res.json();
        const quote = json.data;
        if (!quote || quote.price == null) return;

        const liveBar: TvBar = {
          time: Date.now(),
          open: quote.open || quote.price,
          high: quote.high || quote.price,
          low: quote.low || quote.price,
          close: quote.price,
          volume: quote.volume || 0,
        };

        onRealtimeCallback(liveBar);
      } catch {}
    }, 2000);

    this.subscribers.set(subscriberUID, {
      symbol,
      resolution,
      callback: onRealtimeCallback,
      timerId,
    });
  }

  public unsubscribeBars(subscriberUID: string): void {
    const sub = this.subscribers.get(subscriberUID);
    if (sub && sub.timerId) {
      clearInterval(sub.timerId);
    }
    this.subscribers.delete(subscriberUID);
  }

  public getServerTime(callback: (serverTime: number) => void): void {
    fetch("/api/v1/chart/tradingview/time")
      .then((r) => r.text())
      .then((txt) => {
        const t = parseInt(txt, 10);
        callback(Number.isFinite(t) ? t : Math.floor(Date.now() / 1000));
      })
      .catch(() => callback(Math.floor(Date.now() / 1000)));
  }
}

