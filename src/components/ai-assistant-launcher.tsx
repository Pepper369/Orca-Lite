"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { OrcaMark } from "@/components/logo";
import { useIsDesktop } from "@/lib/hooks";

type WidgetMode = "market" | "finance";

const LazyAiAssistantWidget = lazy(() =>
  import("@/components/ai-assistant-widget").then((m) => ({
    default: m.AiAssistantWidget,
  })),
);

/**
 * Lightweight floating launcher for ORCA AI.
 * Defers downloading and mounting the 644-line AiAssistantWidget chunk + personal finance store
 * until the user clicks the launcher or dispatches "orca:open-ai-widget".
 */
export function AiAssistantLauncher() {
  const isDesktop = useIsDesktop();
  const [activated, setActivated] = useState(false);
  const [initialMode, setInitialMode] = useState<WidgetMode | undefined>(undefined);

  useEffect(() => {
    if (activated) return;
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ mode?: WidgetMode }>;
      if (custom.detail?.mode) setInitialMode(custom.detail.mode);
      setActivated(true);
    };
    window.addEventListener("orca:open-ai-widget", handleOpen);
    return () => window.removeEventListener("orca:open-ai-widget", handleOpen);
  }, [activated]);

  if (activated) {
    return (
      <Suspense fallback={null}>
        <LazyAiAssistantWidget initialOpen initialMode={initialMode} />
      </Suspense>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: isDesktop ? "24px" : "76px",
        right: "20px",
        zIndex: 99999,
      }}
    >
      <button
        type="button"
        onClick={() => setActivated(true)}
        aria-label="Mở Trợ lý AI Orca"
        title="Mở Trợ lý ORCA AI"
        className="group relative flex size-14 items-center justify-center rounded-full bg-slate-900/95 border-2 border-cyan-400/50 shadow-xl shadow-cyan-500/20 hover:border-cyan-300 hover:scale-105 active:scale-95 transition-transform duration-150 cursor-pointer select-none"
      >
        <OrcaMark size={32} className="relative select-none pointer-events-none" />
        <span className="absolute top-0 right-0 inline-flex size-3.5 rounded-full border-2 border-slate-900 bg-emerald-500" />
      </button>
    </div>
  );
}
