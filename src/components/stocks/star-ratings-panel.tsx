"use client";

import { memo } from "react";
import type { StarRatings } from "@/lib/services/star-ratings";
import { Star, ShieldAlert, TrendingUp, Award } from "lucide-react";

export interface StarRatingsPanelProps {
  ratings?: StarRatings | null;
  symbol: string;
}

const DIMENSIONS: Array<{
  key: keyof Pick<
    StarRatings,
    | "priceStrength"
    | "trendStrength"
    | "shortTermPos"
    | "moneyFlow"
    | "volatilityRating"
    | "baseRange"
  >;
  labelVi: string;
  descVi: string;
}> = [
  {
    key: "priceStrength",
    labelVi: "Sức mạnh giá",
    descVi: "Xung lực giá ngắn hạn so với thị trường",
  },
  {
    key: "trendStrength",
    labelVi: "Sức mạnh xu hướng",
    descVi: "Vị thế nến trên các đường MA20, MA50, MA200",
  },
  {
    key: "shortTermPos",
    labelVi: "Vị thế RSI",
    descVi: "Trạng thái dao động xung lượng 14 phiên",
  },
  {
    key: "moneyFlow",
    labelVi: "Dòng tiền lớn",
    descVi: "Tương quan thanh khoản và áp lực giá",
  },
  {
    key: "volatilityRating",
    labelVi: "Độ ổn định biến động",
    descVi: "Mức rủi ro phương sai giá trong 20 phiên",
  },
  {
    key: "baseRange",
    labelVi: "Tích lũy nền giá",
    descVi: "Khoảng cách củng cố quanh đường trung bình",
  },
];

export const StarRatingsPanel = memo(function StarRatingsPanel({
  ratings,
  symbol,
}: StarRatingsPanelProps) {
  if (!ratings) return null;

  const isOutperform = ratings.overallVerdict === "Outperform";
  const isUnderperform = ratings.overallVerdict === "Underperform";

  const verdictBadgeColor = isOutperform
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : isUnderperform
    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
    : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <div className="rounded-xl border border-white/5 bg-[#12141a]/95 p-4 sm:p-5 shadow-lg backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Đánh giá kỹ thuật 6 chiều (SSI Model)
            </h3>
            <p className="text-xs text-zinc-400">
              Mô hình chấm điểm định lượng chuẩn hóa SSI iResearch cho {symbol}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-white">
              {ratings.overallGauge}
            </span>
            <span className="text-xs text-zinc-400">/100</span>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictBadgeColor}`}
          >
            {ratings.verdictVi}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {DIMENSIONS.map((dim) => {
          const stars = ratings[dim.key] as number;
          return (
            <div
              key={dim.key}
              className="flex flex-col justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] p-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-200">
                    {dim.labelVi}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((idx) => (
                      <Star
                        key={idx}
                        className={`h-3 w-3 ${
                          idx <= stars
                            ? "fill-amber-400 text-amber-400"
                            : "fill-white/5 text-zinc-600"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400 leading-tight">
                  {dim.descVi}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
