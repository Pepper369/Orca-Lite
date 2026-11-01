/**
 * Convert Wyckoff analysis → chart primitives (Ice, Creek, Midline, SL, T1, T2 & event markers).
 * Directly mirrors the Rubén Villahermosa & AFL/Pine Wyckoff Master 6.0 standard.
 */
import type { OhlcvBar } from "@/lib/types";
import { analyzeWyckoff, type WyckoffSnapshot } from "@/lib/engines/wyckoff-elliott";
import type { ChartSignalMarker } from "@/lib/chart-const";
import type { SmcLineInput } from "./smc-series-helpers";

export interface WyckoffOverlayPayload {
  levels: SmcLineInput[];
  markers: ChartSignalMarker[];
  snapshot: WyckoffSnapshot;
}

export function buildWyckoffOverlay(bars: OhlcvBar[]): WyckoffOverlayPayload | null {
  if (!bars || bars.length < 30) return null;
  const snapshot = analyzeWyckoff(bars);
  if (!snapshot || snapshot.phase === "unknown") return null;

  const levels: SmcLineInput[] = [];
  const markers: ChartSignalMarker[] = [];

  const ice = snapshot.iceLevel ?? snapshot.range?.low ?? null;
  const creek = snapshot.creekLevel ?? snapshot.range?.high ?? null;

  // 1. Ice (Sàn TR) - Đỏ đậm / cam
  if (ice != null && ice > 0) {
    levels.push({
      price: ice,
      color: "rgba(239, 68, 68, 0.90)",
      title: "ICE (Sàn)",
      style: "solid",
      width: 2,
    });
  }

  // 2. Creek (Trần TR) - Vàng cam
  if (creek != null && creek > 0) {
    levels.push({
      price: creek,
      color: "rgba(249, 115, 22, 0.90)",
      title: "CREEK (Trần)",
      style: "solid",
      width: 2,
    });
  }

  // 3. Midline (Trục giữa TR) - Xám nét đứt
  if (ice != null && creek != null && creek > ice) {
    const mid = Number(((ice + creek) / 2).toFixed(2));
    levels.push({
      price: mid,
      color: "rgba(148, 163, 184, 0.65)",
      title: "MID",
      style: "dashed",
      width: 1,
    });
  }

  // 4. Stop Loss (SL) - Hồng tím nét chấm
  if (snapshot.stopLoss != null && snapshot.stopLoss > 0) {
    levels.push({
      price: snapshot.stopLoss,
      color: "rgba(244, 63, 94, 0.85)",
      title: `SL ${snapshot.stopLoss}`,
      style: "dotted",
      width: 1,
    });
  }

  // 5. Target 1 (T1) - Xanh lục nét đứt
  if (snapshot.target1 != null && snapshot.target1 > 0) {
    const t1Label = snapshot.rr1 ? `T1 ${snapshot.target1} (R:R 1:${snapshot.rr1})` : `T1 ${snapshot.target1}`;
    levels.push({
      price: snapshot.target1,
      color: "rgba(16, 185, 129, 0.85)",
      title: t1Label,
      style: "dashed",
      width: 1,
    });
  }

  // 6. Target 2 (T2) - Xanh Cyan nét đứt
  if (snapshot.target2 != null && snapshot.target2 > 0) {
    const t2Label = snapshot.rr2 ? `T2 ${snapshot.target2} (R:R 1:${snapshot.rr2})` : `T2 ${snapshot.target2}`;
    levels.push({
      price: snapshot.target2,
      color: "rgba(6, 182, 212, 0.85)",
      title: t2Label,
      style: "dashed",
      width: 1,
    });
  }

  // 7. Nhãn Sự kiện trên nến (SC, BC, AR, ST, Spring, SOS, UTAD, SOW)
  if (snapshot.keyEvents?.length) {
    for (const ev of snapshot.keyEvents) {
      const isUp = ev.kind === "below";
      markers.push({
        time: ev.time,
        type: isUp ? "buy-signal" : "sell-signal",
        position: isUp ? "belowBar" : "aboveBar",
        shape: isUp ? "arrowUp" : "arrowDown",
        color:
          ev.code === "NO_SUPPLY" || ev.code === "STOPPING_VOLUME" || ev.code.startsWith("SPRING") || ev.code === "SOS"
            ? "#10b981"
            : ev.code === "NO_DEMAND" || ev.code === "UPTHRUST" || ev.code === "SOW" || ev.code === "UTAD" || ev.code === "EFFORT_TO_RISE_FAILED"
              ? "#f43f5e"
              : isUp
                ? "#38bdf8"
                : "#fbbf24",
        title: ev.label,
      });
    }
  }

  return { levels, markers, snapshot };
}
