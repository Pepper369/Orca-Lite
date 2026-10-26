import { OQuantStudio } from "@/components/oquant-quant-studio";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OQuant AI Quant Studio & Bots | Orca-Lite",
  description:
    "Hệ thống xếp hạng đa nhân tố AI Ranking, 4 Bot giao dịch định lượng tự động và Radar tín hiệu vĩ mô thời gian thực độc quyền từ Orca Quant (OQuant).",
};

export default function QuantPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <OQuantStudio />
    </div>
  );
}
