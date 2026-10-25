import { MiQuantStudio } from "@/components/miquant-quant-studio";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MiQuant AI Quant Studio & Bots | Orca-Lite",
  description:
    "Hệ thống xếp hạng đa nhân tố AI Ranking, 4 Bot giao dịch định lượng tự động và Radar 4 tín hiệu vĩ mô thời gian thực clone từ MiQuant Platform.",
};

export default function QuantPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MiQuantStudio />
    </div>
  );
}
