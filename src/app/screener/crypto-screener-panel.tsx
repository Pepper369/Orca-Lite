"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import type { CryptoMarketRow } from "@/lib/types";
import {
  Chg,
  fmtCompact,
  fmtNum,
  MetaLine,
  Panel,
  priceDigits,
} from "@/components/ui";

export function CryptoScreener() {
  const [url] = useState("/api/v1/screener?universe=crypto&limit=40");
  const { data, meta } = useApi<{ universe: string; rows: CryptoMarketRow[] }>(url, {
    refreshInterval: 30_000,
    timeoutMs: 5_000,
  });
  const activeRows = data?.rows?.length ? data.rows : [];
  return (
    <Panel title={`Crypto: ${activeRows.length} mã`} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
              <th className="px-3.5 py-2">Mã</th>
              <th className="py-2 text-right">Giá</th>
              <th className="py-2 text-right">24h %</th>
              <th className="py-2 pr-3.5 text-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.symbol} className="row-hover border-b border-line/40">
                <td className="px-3.5 py-2">
                  <Link href={`/crypto/${r.symbol}`} className="font-semibold hover:text-accent">
                    {r.baseAsset}
                  </Link>
                </td>
                <td className="num py-2 text-right">{fmtNum(r.price, priceDigits(r.price))}</td>
                <td className="py-2 text-right">
                  <Chg value={r.changePercent} arrow={false} />
                </td>
                <td className="num py-2 pr-3.5 text-right text-ink-2">
                  {fmtCompact(r.quoteVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-3.5 py-2">
        <MetaLine meta={meta} />
      </div>
    </Panel>
  );
}
