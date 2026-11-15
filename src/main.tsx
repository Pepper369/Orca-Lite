import React from "react";
import ReactDOM from "react-dom/client";
import "@/app/globals.css";
import "@/app/stock-ui.css";
import "@/app/stock-ui-extra.css";
import "@/app/chart-ui.css";
import "@/app/motion.css";

import { AppShell } from "@/components/shell";
import { ClientProviders } from "@/components/client-providers";
import { SettingsProvider } from "@/lib/settings";
import { AppRouter } from "@/router";
import { ErrorBoundary } from "@/components/error-boundary";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary name="root-main">
        <SettingsProvider>
          <ClientProviders>
            <AppShell>
              <AppRouter />
            </AppShell>
          </ClientProviders>
        </SettingsProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
