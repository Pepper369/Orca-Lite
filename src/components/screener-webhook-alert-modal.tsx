"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { loadWebhookConfig } from "@/lib/webhook-store";

interface ScreenerWebhookAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScreenerWebhookAlertModal({ isOpen, onClose }: ScreenerWebhookAlertModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [customWebhookUrl, setCustomWebhookUrl] = useState("");
  const [customSecret, setCustomSecret] = useState("");
  const [provider, setProvider] = useState<"discord" | "telegram">("discord");

  useEffect(() => {
    if (isOpen) {
      const cfg = loadWebhookConfig();
      if (cfg.url) {
        setCustomWebhookUrl(cfg.url);
        setCustomSecret(cfg.secret);
        setProvider(cfg.provider === "telegram" ? "telegram" : "discord");
      }
    }
  }, [isOpen]);

  const handleTestAlert = async (force: boolean) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/screener/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceDispatch: force,
          webhookUrl: customWebhookUrl.trim() || undefined,
          provider,
          secret: customSecret.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || "Không thể kích hoạt alert lúc này.");
      }

      const json = await res.json();
      setResult(json.data);
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối API Alert Monitor.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-panel-1 border border-border-default shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-gradient-to-r from-emerald-500/10 via-panel-2 to-panel-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <Bell className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary tracking-tight">
                  Screener Alerting & Webhook Bot
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  T-1 Delta Bot
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Tự động quét và bắn thông báo tức thì khi có cổ phiếu mới nhảy vào các điểm nổ chiến lược
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-panel-3 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Active Watched Presets */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              Các bộ lọc đang được theo dõi tự động:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-panel-2 border border-border-subtle flex items-center gap-2">
                <span className="text-base">🚀</span>
                <div>
                  <div className="font-bold text-text-primary">Apex Buy Now</div>
                  <div className="text-[10px] text-text-muted">Chân sóng bùng nổ Sweet Zone</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-panel-2 border border-border-subtle flex items-center gap-2">
                <span className="text-base">🏆</span>
                <div>
                  <div className="font-bold text-text-primary">SMC Golden Pocket</div>
                  <div className="text-[10px] text-text-muted">Fibo 0.618 - 0.65 Smart Money</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-panel-2 border border-border-subtle flex items-center gap-2">
                <span className="text-base">⚓</span>
                <div>
                  <div className="font-bold text-text-primary">Bottom Confluence</div>
                  <div className="text-[10px] text-text-muted">Hợp lưu bắt đáy phân kỳ đảo chiều</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-panel-2 border border-border-subtle flex items-center gap-2">
                <span className="text-base">⚡</span>
                <div>
                  <div className="font-bold text-text-primary">Breakout Vượt Đỉnh</div>
                  <div className="text-[10px] text-text-muted">Khối lượng lớn vượt kháng cự</div>
                </div>
              </div>
            </div>
          </div>

          {/* Webhook Configuration for testing */}
          <div className="p-3.5 rounded-xl bg-panel-2/50 border border-border-subtle space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text-primary">Cấu hình Webhook Cá Nhân (Tùy chọn)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setProvider("discord")}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    provider === "discord"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Discord
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("telegram")}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    provider === "telegram"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Telegram
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-text-muted block">
                {provider === "telegram" ? "Telegram Bot Token (từ @BotFather)" : "Discord Webhook URL"}
              </label>
              <input
                type="text"
                value={customWebhookUrl}
                onChange={(e) => setCustomWebhookUrl(e.target.value)}
                placeholder={provider === "telegram" ? "123456789:AAH..." : "https://discord.com/api/webhooks/..."}
                className="w-full bg-panel-1 border border-border-default rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted"
              />
            </div>

            {provider === "telegram" && (
              <div className="space-y-1.5">
                <label className="text-[10px] text-text-muted block">Telegram Chat ID (User ID hoặc Group ID)</label>
                <input
                  type="text"
                  value={customSecret}
                  onChange={(e) => setCustomSecret(e.target.value)}
                  placeholder="Ví dụ: 123456789 hoặc -100..."
                  className="w-full bg-panel-1 border border-border-default rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted"
                />
              </div>
            )}
          </div>

          {/* Execution Result Box */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  <span>Quét T-1 thành công ({result.durationMs}ms)</span>
                </span>
                <span className="text-[11px] font-normal">
                  Đã bắn: Discord: {result.discordDispatched} | Telegram: {result.telegramDispatched}
                </span>
              </div>
              <div className="text-text-muted text-[11px]">
                Tìm thấy <strong>{result.newlyTriggeredCount}</strong> tín hiệu mới thỏa mãn các tiêu chí lọc:
              </div>
              {result.alerts?.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                  {result.alerts.map((a: any, i: number) => (
                    <div
                      key={i}
                      className="px-2.5 py-1.5 rounded-lg bg-panel-2 border border-border-subtle flex items-center justify-between font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-primary">{a.symbol}</span>
                        <span className="text-text-muted text-[10px] font-sans">[{a.presetNameVi}]</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">{a.price.toLocaleString("vi-VN")} đ</span>
                        <span className="text-amber-300 text-[10px] font-sans">RS {a.rsRating ?? "N/A"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-muted text-[10.5px]">
                  Chưa có mã mới nhảy vào bộ lọc so với snapshot T-1 trước đó (đã lưu trạng thái để theo dõi chu kỳ tiếp theo).
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border-subtle bg-panel-2/80 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <Clock className="size-3" /> Cron tự động: 60 giây / lần
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleTestAlert(false)}
              className="px-3 py-1.5 rounded-xl bg-panel-3 hover:bg-panel-1 border border-border-subtle text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
              title="Chỉ quét mã mới so với snapshot T-1"
            >
              Quét T-1
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleTestAlert(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
              title="Bắn alert ngay cho các mã đang thỏa mãn (bỏ qua cooldown)"
            >
              <Send className="size-3" />
              <span>{loading ? "Đang quét..." : "Bắn Alert Ngay (Test)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
