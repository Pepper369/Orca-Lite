"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import { LiveBotCockpit } from "@/components/live-bot-cockpit";
import {
  classifyAccountEnvironment,
  summarizeLinkedTradingAccounts,
  type AccountEnvironment,
  type DemoAccountSubtype,
  type LinkedTradingAccountSummary,
} from "@/lib/engines/bot-telemetry-types";
import type {
  BrokerPlatform,
  CopyExecutionOrder,
  CopyOrderStatus,
  FollowerAccount,
  MasterTraderPerformance,
} from "@/lib/engines/copy-trade-engine";
import {
  BROKER_CATALOG,
  detectBrokerCredentialsPattern,
  getBrokerMeta,
  getCryptoBrokerCatalog,
  getForexBrokerCatalog,
  isMt5BrokerPlatform,
  type BrokerCategory,
} from "@/lib/engines/broker-registry";
import type { SetupGrade } from "@/lib/engines/fx-crypto-precision-engine";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FlaskConical,
  KeyRound,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

interface WorkerStatus {
  started: boolean;
  isTickRunning: boolean;
  pollIntervalMs: number;
  lastTickAt: number | null;
  lastDispatchedCount: number;
}

interface CopyTradeAccountsPayload {
  accounts: FollowerAccount[];
  tradingAccountSummary?: LinkedTradingAccountSummary;
  performance: MasterTraderPerformance;
  workerStatus?: WorkerStatus;
  realNavUsd?: number;
  demoNavUsd?: number;
  realAccountCount?: number;
  demoAccountCount?: number;
  activeRealCount?: number;
  activeDemoCount?: number;
  totalManagedCapitalUsd: number;
  activeCount: number;
  verifiedLiveCount: number;
  killSwitchedCount: number;
}

interface CopyableSignalItem {
  id: string;
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  winrateScore: number;
  setupGrade: string | null;
  expectancyR: number | null;
  recommendedLeverage: number;
  status: string;
  recommendedLotsOrMargin: string;
  masterLotsOrQty: number;
  updatedAt: number;
}

interface CopyTradeSignalsPayload {
  signals: CopyableSignalItem[];
  executionLogs: CopyExecutionOrder[];
  performance: MasterTraderPerformance;
}

interface TestConnectionResult {
  verified: boolean;
  platform: string;
  isTestnet: boolean;
  balanceUsd: number | null;
  availableMarginUsd: number | null;
  canTrade: boolean;
  positionMode?: string;
  resolvedEndpoint?: string;
  latencyMs: number;
  rawMessage: string;
}

interface DualTestConnectionResult {
  platform: string;
  real: TestConnectionResult;
  demo: TestConnectionResult;
  connectedEnvironments: Array<"REAL" | "DEMO">;
  anyVerified: boolean;
  primary: TestConnectionResult;
  summaryMessage: string;
}

const PLATFORM_LABELS: Record<BrokerPlatform, string> = Object.fromEntries(
  BROKER_CATALOG.map((item) => [item.platform, item.name]),
) as Record<BrokerPlatform, string>;

const CRYPTO_CATALOG = getCryptoBrokerCatalog();
const FOREX_CATALOG = getForexBrokerCatalog();

function statusBadgeTone(status?: FollowerAccount["connectionStatus"]): "up" | "down" | "warn" | "neutral" | "accent" {
  switch (status) {
    case "CONNECTED_VERIFIED":
      return "up";
    case "KILL_SWITCHED":
    case "ERROR":
      return "down";
    case "AWAITING_EA":
    case "UNVERIFIED":
      return "warn";
    case "PAPER_SIMULATED":
      return "accent";
    default:
      return "neutral";
  }
}

function statusLabel(status?: FollowerAccount["connectionStatus"]): string {
  switch (status) {
    case "CONNECTED_VERIFIED":
      return "VERIFIED LIVE/TESTNET";
    case "KILL_SWITCHED":
      return "KILL-SWITCHED";
    case "ERROR":
      return "API ERROR";
    case "AWAITING_EA":
      return "CHỜ EA MT5 POLL";
    case "UNVERIFIED":
      return "CHƯA XÁC MINH";
    case "PAPER_SIMULATED":
      return "PAPER SANDBOX";
    default:
      return "UNKNOWN";
  }
}

function orderStatusTone(status: CopyOrderStatus): "up" | "down" | "warn" | "neutral" | "accent" {
  if (status === "FILLED") return "up";
  if (status === "FILLED_PAPER") return "accent";
  if (status === "PENDING_EA") return "warn";
  return "down";
}

function demoSubtypeBadgeLabel(sub: DemoAccountSubtype | null): string {
  if (sub === "EXCHANGE_TESTNET") return "DEMO · TESTNET";
  if (sub === "MT5_DEMO") return "DEMO · MT5";
  return "DEMO · PAPER";
}

export function CopyTradePanel({ mode = "full" }: { mode?: "full" | "vault" }) {
  const { data: accountsData, mutate: mutateAccounts } = useApi<CopyTradeAccountsPayload>(
    "/api/v1/copytrade/accounts",
    { refreshInterval: 10_000, keepPreviousData: true },
  );

  const { data: signalsData, mutate: mutateSignals } = useApi<CopyTradeSignalsPayload>(
    mode === "full" ? "/api/v1/copytrade/signals" : null,
    { refreshInterval: 10_000, keepPreviousData: true },
  );

  const [banner, setBanner] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchTargetEnv, setDispatchTargetEnv] = useState<AccountEnvironment | "ALL">("DEMO");
  const [vaultEnvFilter, setVaultEnvFilter] = useState<"ALL" | AccountEnvironment>("ALL");
  const [testingConnId, setTestingConnId] = useState<string | null>(null);
  const [deletingConnId, setDeletingConnId] = useState<string | null>(null);
  const [rotatingConnId, setRotatingConnId] = useState<string | null>(null);
  const [workerRunningNow, setWorkerRunningNow] = useState(false);
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);

  // Add broker form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState<BrokerPlatform>("BINANCE_FUTURES");
  const [formMt5Mode, setFormMt5Mode] = useState<"ea" | "metaapi">("metaapi");
  const [formAccount, setFormAccount] = useState("");
  const [formBalance, setFormBalance] = useState(1000);
  const [formRiskMult, setFormRiskMult] = useState(1.0);
  const [formSlippage, setFormSlippage] = useState(2.5);
  const [formLeverageCap, setFormLeverageCap] = useState(5);
  const [formMaxDailyLoss, setFormMaxDailyLoss] = useState(250);
  const [formIsTestnet, setFormIsTestnet] = useState(true);
  const [formAutoExecute, setFormAutoExecute] = useState(true);
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiSecret, setFormApiSecret] = useState("");
  const [formPassphrase, setFormPassphrase] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestRes, setModalTestRes] = useState<TestConnectionResult | null>(null);
  const [modalDualTestRes, setModalDualTestRes] = useState<DualTestConnectionResult | null>(null);
  const [brokerMarketTab, setBrokerMarketTab] = useState<"CRYPTO" | "FOREX">("CRYPTO");
  const [modalCategory, setModalCategory] = useState<BrokerCategory>("CRYPTO");

  // One-time MT5 EA Token modal
  const [eaTokenModal, setEaTokenModal] = useState<{ name: string; platform: string; token: string } | null>(null);
  const [copiedEaToken, setCopiedEaToken] = useState(false);

  const accounts = accountsData?.accounts ?? [];
  const tradingSummary = accountsData?.tradingAccountSummary ?? summarizeLinkedTradingAccounts(accounts);
  const workerStatus = accountsData?.workerStatus;
  const availableSignals = signalsData?.signals ?? [];
  const executionLogs = signalsData?.executionLogs ?? [];
  const anyKillSwitched = (accountsData?.killSwitchedCount ?? 0) > 0;
  const autoBotActiveCount = accounts.filter((a) => a.isActive && a.autoExecuteEnabled && !a.killSwitched).length;

  const realAccountsList = accounts.filter((a) => classifyAccountEnvironment(a).environment === "REAL");
  const demoAccountsList = accounts.filter((a) => classifyAccountEnvironment(a).environment === "DEMO");
  const realNavUsd =
    accountsData?.realNavUsd ?? realAccountsList.reduce((sum, a) => sum + a.balanceUsd, 0);
  const demoNavUsd =
    accountsData?.demoNavUsd ?? demoAccountsList.reduce((sum, a) => sum + a.balanceUsd, 0);
  const filteredVaultAccounts =
    vaultEnvFilter === "REAL"
      ? realAccountsList
      : vaultEnvFilter === "DEMO"
        ? demoAccountsList
        : accounts;

  const selectedBrokerMeta = getBrokerMeta(formPlatform);
  const isMt5Bridge = isMt5BrokerPlatform(formPlatform);
  const isMetaApiMode = isMt5Bridge && formMt5Mode === "metaapi";
  const isRestExchange = !isMt5Bridge && formPlatform !== "TELEGRAM_1CLICK";

  const keyRecognition = formApiKey.trim().length >= 6
    ? detectBrokerCredentialsPattern({
        apiKey: formApiKey,
        apiSecret: formApiSecret,
        passphrase: formPassphrase,
      })
    : null;

  const openQuickConnect = (platform: BrokerPlatform, defaultBalance = 1000, defaultLeverage = 5) => {
    resetModalForm();
    const meta = getBrokerMeta(platform);
    setModalCategory(meta.category);
    setFormPlatform(platform);
    setFormBalance(defaultBalance);
    setFormLeverageCap(meta.category === "FOREX" ? 1 : defaultLeverage);
    setFormMt5Mode("metaapi");
    setShowAddModal(true);
  };

  const resetModalForm = () => {
    setFormName("");
    setFormAccount("");
    setFormApiKey("");
    setFormApiSecret("");
    setFormPassphrase("");
    setModalTestRes(null);
    setModalDualTestRes(null);
  };

  const handleTogglePatch = async (
    id: string,
    patch: { isActive?: boolean; autoExecuteEnabled?: boolean; killSwitched?: boolean },
  ) => {
    try {
      const res = await fetch("/api/v1/copytrade/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || json.success === false) {
        setBanner({ tone: "err", text: json.error?.message || "Không thể cập nhật trạng thái tài khoản" });
      }
      await mutateAccounts();
    } catch {
      setBanner({ tone: "err", text: "Lỗi kết nối máy chủ khi cập nhật tài khoản" });
    }
  };

  const handleKillSwitch = async (engage: boolean) => {
    setKillSwitchBusy(true);
    try {
      const res = await fetch("/api/v1/copytrade/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engage,
          reason: engage ? "Người dùng nhấn Kill-Switch khẩn cấp" : undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { message?: string; accounts?: FollowerAccount[] };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false) {
        setBanner({ tone: "err", text: json.error?.message || "Thao tác Kill-Switch thất bại" });
      } else {
        setBanner({
          tone: engage ? "warn" : "ok",
          text: json.data?.message || (engage ? "Đã bật Kill-Switch khẩn cấp" : "Đã mở khóa bot"),
        });
        if (json.data?.accounts) {
          const updatedAccounts = json.data.accounts;
          await mutateAccounts(
            (prev) =>
              prev && prev.success
                ? {
                    ...prev,
                    data: {
                      ...prev.data,
                      accounts: updatedAccounts,
                      activeCount: updatedAccounts.filter((a) => a.isActive).length,
                      verifiedLiveCount: updatedAccounts.filter(
                        (a) => a.connectionStatus === "CONNECTED_VERIFIED",
                      ).length,
                      killSwitchedCount: updatedAccounts.filter((a) => a.killSwitched).length,
                    },
                  }
                : prev,
            { revalidate: true },
          );
          return;
        }
      }
      await mutateAccounts(undefined, { revalidate: true });
    } catch {
      setBanner({ tone: "err", text: "Không thể gọi API Kill-Switch" });
    } finally {
      setKillSwitchBusy(false);
    }
  };

  const handleTestExistingConnection = async (connectionId: string) => {
    setTestingConnId(connectionId);
    try {
      const res = await fetch("/api/v1/copytrade/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { verification?: TestConnectionResult };
        error?: { message?: string };
      };
      const v = json.data?.verification;
      if (!res.ok || json.success === false || !v) {
        setBanner({ tone: "err", text: json.error?.message || "Kiểm tra kết nối thất bại" });
      } else {
        setBanner({
          tone: v.verified && v.canTrade ? "ok" : "warn",
          text: `${v.rawMessage}${v.balanceUsd !== null ? ` · Số dư: $${v.balanceUsd.toLocaleString()}` : ""} (${v.latencyMs}ms)`,
        });
      }
      await mutateAccounts();
    } catch {
      setBanner({ tone: "err", text: "Lỗi mạng khi ping API sàn" });
    } finally {
      setTestingConnId(null);
    }
  };

  const handleDeleteAccount = async (acc: FollowerAccount) => {
    if (!window.confirm(`Xóa kết nối "${acc.name}" (${acc.platform}) và hủy khóa mã hóa trong Broker Vault?`)) {
      return;
    }
    setDeletingConnId(acc.id);
    try {
      const res = await fetch(`/api/v1/copytrade/accounts?id=${encodeURIComponent(acc.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || json.success === false) {
        setBanner({ tone: "err", text: json.error?.message || "Không thể xóa kết nối" });
      } else {
        setBanner({ tone: "ok", text: `Đã ngắt kết nối và xóa khóa của "${acc.name}" khỏi Vault.` });
        await mutateAccounts();
      }
    } catch {
      setBanner({ tone: "err", text: "Lỗi mạng khi xóa kết nối" });
    } finally {
      setDeletingConnId(null);
    }
  };

  const handleRegenerateEaToken = async (acc: FollowerAccount) => {
    setRotatingConnId(acc.id);
    try {
      const res = await fetch("/api/v1/copytrade/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acc.id, regenerateEaToken: true }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { oneTimeEaToken?: string | null };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false) {
        setBanner({ tone: "err", text: json.error?.message || "Không thể tạo lại EA Token" });
      } else if (json.data?.oneTimeEaToken) {
        setCopiedEaToken(false);
        setEaTokenModal({ name: acc.name, platform: acc.platform, token: json.data.oneTimeEaToken });
        await mutateAccounts();
      }
    } catch {
      setBanner({ tone: "err", text: "Lỗi kết nối khi tạo lại EA Token" });
    } finally {
      setRotatingConnId(null);
    }
  };

  const handleTriggerWorkerNow = async () => {
    setWorkerRunningNow(true);
    try {
      const res = await fetch("/api/v1/copytrade/worker", { method: "POST" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { tick?: { dispatched: number; activeAutoAccounts: number } };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false) {
        setBanner({ tone: "err", text: json.error?.message || "Không thể kích hoạt Auto-Trade Engine" });
      } else {
        const t = json.data?.tick;
        setBanner({
          tone: t && t.activeAutoAccounts === 0 ? "warn" : "ok",
          text:
            t && t.activeAutoAccounts === 0
              ? "Auto-Trade Engine đã quét nhưng chưa có tài khoản nào bật AUTO ON. Hãy bật nút AUTO ON ở bảng tài khoản bên dưới."
              : `Auto-Trade Engine đã quét xong trên ${t?.activeAutoAccounts ?? 0} bot: đẩy thành công ${t?.dispatched ?? 0} lệnh mới.`,
        });
        await Promise.all([mutateAccounts(), mode === "full" ? mutateSignals() : Promise.resolve()]);
      }
    } catch {
      setBanner({ tone: "err", text: "Lỗi khi gọi Auto-Trade Engine Worker" });
    } finally {
      setWorkerRunningNow(false);
    }
  };

  const handleModalDryTest = async () => {
    const canTest = isRestExchange || isMetaApiMode;
    const missingKey = !formApiKey.trim();
    const missingSecret = selectedBrokerMeta.fields.requiresSecret && !formApiSecret.trim();
    const missingMt5 = isMetaApiMode && (!formApiKey.trim() || !formApiSecret.trim());
    if (!canTest || missingKey || missingSecret || missingMt5) {
      setBanner({
        tone: "warn",
        text: isMetaApiMode
          ? "Vui lòng nhập đầy đủ MetaApi Token và MetaApi Account ID trước khi kiểm tra"
          : `Vui lòng nhập đầy đủ ${selectedBrokerMeta.fields.apiKeyLabel} trước khi kiểm tra`,
      });
      return;
    }
    if (selectedBrokerMeta.fields.requiresPassphrase && !formPassphrase.trim()) {
      setBanner({
        tone: "warn",
        text: `${selectedBrokerMeta.shortName} bắt buộc nhập Passphrase trước khi kiểm tra`,
      });
      return;
    }
    setModalTesting(true);
    setModalTestRes(null);
    setModalDualTestRes(null);
    try {
      const res = await fetch("/api/v1/copytrade/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: formPlatform,
          apiKey: formApiKey.trim(),
          apiSecret: formApiSecret.trim(),
          passphrase: formPassphrase.trim() || undefined,
          isTestnet: formIsTestnet,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { verification?: TestConnectionResult; dualVerification?: DualTestConnectionResult };
        error?: { message?: string };
      };
      if (json.data?.dualVerification) {
        setModalDualTestRes(json.data.dualVerification);
      }
      if (json.data?.verification) {
        setModalTestRes(json.data.verification);
        if (json.data.verification.verified && json.data.verification.balanceUsd) {
          setFormBalance(Math.round(json.data.verification.balanceUsd));
        }
      } else {
        setModalTestRes({
          verified: false,
          platform: formPlatform,
          isTestnet: formIsTestnet,
          balanceUsd: null,
          availableMarginUsd: null,
          canTrade: false,
          latencyMs: 0,
          rawMessage: json.error?.message || "Không thể kết nối sàn",
        });
      }
    } catch {
      setModalTestRes({
        verified: false,
        platform: formPlatform,
        isTestnet: formIsTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs: 0,
        rawMessage: "Lỗi mạng khi thử kết nối API sàn",
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const res = await fetch("/api/v1/copytrade/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim() || `${PLATFORM_LABELS[formPlatform]} Bot`,
          platform: formPlatform,
          accountNumber: formAccount.trim() || undefined,
          balanceUsd: formBalance,
          riskMultiplier: formRiskMult,
          maxAllowedSlippagePips: formSlippage,
          leverageCap: formLeverageCap,
          maxDailyLossUsd: formMaxDailyLoss,
          isTestnet: formIsTestnet,
          autoExecuteEnabled: formAutoExecute,
          apiKey: (isRestExchange || isMetaApiMode) && formApiKey.trim() ? formApiKey.trim() : undefined,
          apiSecret:
            (isRestExchange || isMetaApiMode) && (formApiSecret.trim() || (!selectedBrokerMeta.fields.requiresSecret && formApiKey.trim()))
              ? formApiSecret.trim() || "read-only"
              : undefined,
          passphrase:
            (selectedBrokerMeta.fields.requiresPassphrase || isMetaApiMode || isRestExchange) && formPassphrase.trim()
              ? formPassphrase.trim()
              : undefined,
        }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          account: FollowerAccount;
          accounts?: FollowerAccount[];
          verification?: TestConnectionResult | null;
          dualVerification?: DualTestConnectionResult | null;
          oneTimeEaToken?: string | null;
        };
        error?: { message?: string };
      };

      if (!res.ok || json.success === false || !json.data) {
        setBanner({ tone: "err", text: json.error?.message || "Không thể lưu kết nối Broker Vault" });
        return;
      }

      const { account, accounts: createdList, verification, dualVerification, oneTimeEaToken } = json.data;
      setShowAddModal(false);
      resetModalForm();

      if (oneTimeEaToken) {
        setCopiedEaToken(false);
        setEaTokenModal({ name: account.name, platform: account.platform, token: oneTimeEaToken });
      }

      if (dualVerification) {
        const count = createdList?.length ?? 1;
        setBanner({
          tone: dualVerification.anyVerified ? "ok" : "warn",
          text:
            count > 1
              ? `Đã đồng bộ ${count} tài khoản (REAL + DEMO) vào Vault AES-256-GCM · ${dualVerification.summaryMessage}`
              : `Đã lưu "${account.name}" vào Vault AES-256-GCM · ${dualVerification.summaryMessage}`,
        });
      } else if (verification) {
        setBanner({
          tone: verification.verified && verification.canTrade ? "ok" : "warn",
          text: `Đã lưu "${account.name}" vào Vault AES-256-GCM · ${verification.rawMessage}`,
        });
      } else {
        setBanner({
          tone: "ok",
          text: `Đã lưu kết nối "${account.name}" (${account.connectionStatus})`,
        });
      }

      await mutateAccounts();
    } catch {
      setBanner({ tone: "err", text: "Lỗi khi tạo kết nối mới" });
    } finally {
      setModalSaving(false);
    }
  };

  const handleDispatchSignal = async (sig: CopyableSignalItem) => {
    setDispatchingId(sig.id);
    try {
      const res = await fetch("/api/v1/copytrade/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: {
            id: sig.id,
            symbol: sig.symbol,
            assetType: sig.assetType,
            direction: sig.direction,
            entryPrice: sig.entryPrice,
            stopLossPrice: sig.stopLossPrice,
            takeProfit1: sig.tp1,
            takeProfit2: sig.tp2 ?? undefined,
            takeProfit3: sig.tp3 ?? undefined,
            masterLotsOrQty: sig.masterLotsOrQty,
            masterCapitalUsd: 10_000,
            winrateScore: sig.winrateScore,
            setupGrade: (sig.setupGrade as SetupGrade) ?? undefined,
            recommendedLeverage: sig.recommendedLeverage,
            timestamp: sig.updatedAt || Date.now(),
          },
          currentMarketPrice: sig.entryPrice,
          manualOverride: true,
          targetEnvironment: dispatchTargetEnv,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { filledCount: number; pendingEaCount: number; rejectedCount: number };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false || !json.data) {
        setBanner({ tone: "err", text: json.error?.message || "Đẩy lệnh thất bại" });
      } else {
        const envText = dispatchTargetEnv === "ALL" ? "REAL + DEMO" : dispatchTargetEnv;
        setBanner({
          tone: json.data.rejectedCount > 0 && json.data.filledCount === 0 ? "warn" : "ok",
          text: `Đẩy lệnh [${envText}] ${sig.symbol} ${sig.direction}: ${json.data.filledCount} khớp/paper, ${json.data.pendingEaCount} chờ MT5 EA, ${json.data.rejectedCount} bị chặn bởi guardrail.`,
        });
      }
      await Promise.all([mutateSignals(), mutateAccounts()]);
    } catch {
      setBanner({ tone: "err", text: "Lỗi kết nối khi đẩy lệnh Copy Trade" });
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Real-Time SSE Bot Trading Cockpit & Per-Account PnL (Real & Demo) */}
      {mode === "full" && (
        <LiveBotCockpit
          variant="full"
          onAfterAction={() => {
            void mutateAccounts();
            void mutateSignals();
          }}
        />
      )}

      {/* Split NAV Vault Summary & Emergency Kill-Switch Control Strip */}
      {mode === "vault" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.04] p-3.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                REAL NAV (Tiền Thật)
              </span>
              <Badge tone="warn">{realAccountsList.length} TK</Badge>
            </div>
            <div className="mt-1.5 text-xl font-extrabold text-ink num">
              ${realNavUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">
              {accountsData?.verifiedLiveCount ?? 0} kết nối đã xác minh API sàn
            </p>
          </div>

          <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/[0.04] p-3.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-400">
              <span className="inline-flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                DEMO NAV (Testnet &amp; Paper)
              </span>
              <Badge tone="accent">{demoAccountsList.length} TK</Badge>
            </div>
            <div className="mt-1.5 text-xl font-extrabold text-ink num">
              ${demoNavUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">
              Tách biệt hoàn toàn khỏi tài sản tiền thật
            </p>
          </div>

          <div
            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
              anyKillSwitched
                ? "border-down/60 bg-down/10"
                : "border-line/70 bg-surface-primary"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-ink-3">
              <span>Broker Vault &amp; Kill-Switch</span>
              <ShieldAlert className={`h-4 w-4 ${anyKillSwitched ? "text-down animate-pulse" : "text-warn"}`} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              {anyKillSwitched ? (
                <button
                  type="button"
                  disabled={killSwitchBusy}
                  onClick={() => handleKillSwitch(false)}
                  className="w-full rounded-lg bg-positive px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-positive/90 transition-colors disabled:opacity-50"
                >
                  {killSwitchBusy ? "Đang xử lý..." : "Mở Khóa An Toàn (Release)"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={killSwitchBusy}
                  onClick={() => handleKillSwitch(true)}
                  className="w-full rounded-lg bg-down px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-down/90 transition-colors disabled:opacity-50"
                >
                  {killSwitchBusy ? "Đang khóa..." : "KILL-SWITCH: DỪNG TOÀN BỘ BOT"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
            anyKillSwitched
              ? "border-down/60 bg-down/10"
              : "border-line/70 bg-surface-primary"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <Lock className="h-4 w-4 text-positive shrink-0" />
            <span className="font-semibold text-ink">Bảo Mật Broker Vault:</span>
            <Badge tone="up">AES-256-GCM</Badge>
            <Badge tone="accent">Idempotency Lock</Badge>
            <Badge tone="warn">Daily Loss Cap</Badge>
            <span className="text-ink-3 hidden sm:inline">
              · Tách luồng thực thi REAL / DEMO độc lập
            </span>
          </div>
          <div className="flex items-center gap-2">
            {anyKillSwitched ? (
              <button
                type="button"
                disabled={killSwitchBusy}
                onClick={() => handleKillSwitch(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-positive px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-positive/90 transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {killSwitchBusy ? "Đang xử lý..." : "Mở Khóa Bot (Release Kill-Switch)"}
              </button>
            ) : (
              <button
                type="button"
                disabled={killSwitchBusy}
                onClick={() => handleKillSwitch(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-down px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-down/90 transition-colors disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {killSwitchBusy ? "Đang khóa..." : "KILL-SWITCH: DỪNG KHẨN CẤP"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-[12px] ${
            banner.tone === "ok"
              ? "border-positive/40 bg-positive/10 text-positive"
              : banner.tone === "warn"
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-down/40 bg-down/10 text-down"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {banner.tone === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate sm:whitespace-normal">{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="rounded p-0.5 hover:bg-surface-elevated"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Orca Linked Trading Accounts Inventory (1 API Key Set = 1 Trading Account) */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13.5px] font-bold text-ink flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-positive" />
              Tài Khoản Giao Dịch Liên Kết Trên Orca (Theo Bộ API Key)
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              Mỗi bộ API Key / EA Token duy nhất đại diện cho 1 tài khoản giao dịch đã xác thực với Orca Engine (không tính Paper Sandbox).
            </p>
          </div>
          <Badge tone={tradingSummary.totalApiAccounts > 0 ? "up" : "neutral"}>
            Tổng: {tradingSummary.totalApiAccounts} tài khoản API
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.05] p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-300">
              <span>Tài khoản Crypto</span>
              <Badge tone={tradingSummary.cryptoAccountsCount > 0 ? "up" : "neutral"}>
                {tradingSummary.cryptoVerifiedCount}/{tradingSummary.cryptoAccountsCount} Verified
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num">{tradingSummary.cryptoAccountsCount}</span>
              <span className="text-[11px] text-ink-3">tài khoản (Binance / OKX / Bybit)</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-400/35 bg-emerald-400/[0.05] p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-300">
              <span>Tài khoản Forex</span>
              <Badge tone={tradingSummary.forexAccountsCount > 0 ? "up" : "neutral"}>
                {tradingSummary.forexVerifiedCount}/{tradingSummary.forexAccountsCount} Verified
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num">{tradingSummary.forexAccountsCount}</span>
              <span className="text-[11px] text-ink-3">tài khoản (Exness / XM / MT5)</span>
            </div>
          </div>

          <div className="rounded-xl border border-accent-primary/35 bg-accent-primary/[0.05] p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-accent-primary">
              <span>Tổng Quy Mô Liên Kết</span>
              <Badge tone="accent">AES-256-GCM</Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num">{tradingSummary.totalApiAccounts}</span>
              <span className="text-[11px] text-ink-3">bộ API Key đang kết nối Engine</span>
            </div>
          </div>
        </div>

        {tradingSummary.accounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tradingSummary.accounts.map((item) => (
              <div
                key={item.keyId}
                className="inline-flex items-center gap-2 rounded-lg border border-line/80 bg-surface-elevated/80 px-2.5 py-1.5 text-[11px]"
              >
                <span
                  className={`size-2 rounded-full ${item.verified ? "bg-positive" : "bg-warn"}`}
                  title={item.verified ? "Đã xác minh API" : "Chưa xác minh / Lỗi"}
                />
                <span className="font-semibold text-ink">{item.name}</span>
                <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] font-bold text-ink-2">
                  {item.assetClass}
                </span>
                <span className="font-mono text-[10px] text-ink-3">{item.credentialMasked}</span>
                <span className="text-[10px] font-semibold text-cyan-300">
                  {item.environments.join(" + ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick-Connect Broker Cards (Binance · OKX · Exness · XM) */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13.5px] font-bold text-ink flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-accent-primary" />
              Gắn API Key Sàn Giao Dịch (Crypto &amp; Forex Auto-Trade)
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              Chọn sàn bên dưới để gắn API Key mã hóa AES-256-GCM và kết nối trực tiếp vào Orca Quant Auto-Trade Engine.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface-elevated/70 px-2.5 py-1 text-[11px] text-ink-2">
              <Cpu className="h-3.5 w-3.5 text-positive" />
              <span>
                Auto-Bot Engine:{" "}
                <strong className={autoBotActiveCount > 0 ? "text-positive" : "text-ink"}>
                  {autoBotActiveCount > 0 ? `${autoBotActiveCount} Bot Đang Chạy` : "Đang Chờ Bật AUTO"}
                </strong>
                {workerStatus ? ` · Quét ${Math.round(workerStatus.pollIntervalMs / 1000)}s/lần` : ""}
              </span>
            </span>
            <button
              type="button"
              disabled={workerRunningNow}
              onClick={() => void handleTriggerWorkerNow()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-primary/40 bg-accent-primary/15 px-2.5 py-1 text-[11px] font-semibold text-accent-primary hover:bg-accent-primary hover:text-white transition-colors disabled:opacity-50"
            >
              <Zap className={`h-3.5 w-3.5 ${workerRunningNow ? "animate-pulse" : ""}`} />
              {workerRunningNow ? "Đang quét..." : "Quét & Trade Ngay"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
          <div className="inline-flex rounded-xl border border-line bg-surface-elevated p-1 text-[11.5px]">
            <button
              type="button"
              onClick={() => setBrokerMarketTab("CRYPTO")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                brokerMarketTab === "CRYPTO"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Sàn Crypto &amp; Phái Sinh ({CRYPTO_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setBrokerMarketTab("FOREX")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                brokerMarketTab === "FOREX"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Nhà Môi Giới &amp; Trung Tâm Forex ({FOREX_CATALOG.length})
            </button>
          </div>
          <span className="text-[11px] text-ink-3">
            Tự nhận diện định dạng API Key khi dán · Quét song song REAL + DEMO
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(brokerMarketTab === "CRYPTO" ? CRYPTO_CATALOG : FOREX_CATALOG).map((broker) => {
            const matched = accounts.filter((a) => a.platform === broker.platform);
            const verifiedCount = matched.filter(
              (a) => a.connectionStatus === "CONNECTED_VERIFIED" || a.hasApiKey || a.hasEaToken,
            ).length;
            const accentClass =
              broker.category === "CRYPTO"
                ? verifiedCount > 0
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "border-amber-400/25 bg-surface-elevated/60"
                : verifiedCount > 0
                  ? "border-emerald-400/50 bg-emerald-400/10"
                  : "border-emerald-400/25 bg-surface-elevated/60";
            return (
              <div
                key={broker.platform}
                className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${accentClass}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-bold text-ink">{broker.shortName}</span>
                    <Badge tone={verifiedCount > 0 ? "up" : broker.supportsDirectRestVerify ? "accent" : "neutral"}>
                      {verifiedCount > 0
                        ? `${verifiedCount} đã gắn`
                        : broker.supportsDualEnv
                          ? "REAL + DEMO"
                          : broker.isMt5Broker
                            ? "MT5 HUB"
                            : broker.category}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-medium text-ink-2">{broker.venueType}</div>
                  <div className="mt-1 text-[10px] font-mono text-accent-2">
                    {broker.tierLabel}
                    {broker.defaultSymbolSuffix ? ` · Suffix "${broker.defaultSymbolSuffix}"` : ""}
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-3">{broker.keyFormatHintVi}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickConnect(
                      broker.platform,
                      broker.category === "CRYPTO" ? 1000 : 2000,
                      broker.category === "CRYPTO" ? 5 : 1,
                    )
                  }
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {verifiedCount > 0 ? `Thêm TK ${broker.shortName}` : `Kết nối ${broker.shortName}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* High-Winrate Copyable Signals */}
      {mode === "full" && (
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-ink">
              Tín Hiệu Đạt Chuẩn Winrate Cao (High-Winrate Confluence &amp; Grade A+/A)
            </h3>
            <p className="mt-0.5 text-[11px] text-ink-3">
              Auto-Bot chỉ tự động vào lệnh với tín hiệu Grade A+/A. Nhấn Copy Now để đẩy thủ công qua Risk Guardrails.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-line bg-surface-elevated p-0.5 text-[10.5px]">
              <span className="px-2 text-ink-3 font-medium">Đẩy vào:</span>
              {(
                [
                  { id: "DEMO", label: "DEMO (An toàn)" },
                  { id: "REAL", label: "REAL (Tiền thật)" },
                  { id: "ALL", label: "Cả 2" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDispatchTargetEnv(opt.id)}
                  className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                    dispatchTargetEnv === opt.id
                      ? opt.id === "REAL"
                        ? "bg-amber-500 text-slate-950"
                        : opt.id === "DEMO"
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-accent-primary text-white"
                      : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Badge tone="accent">{availableSignals.length} Kèo Active</Badge>
          </div>
        </div>

        {availableSignals.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-line/60 bg-surface-elevated/40 p-5 text-center text-[12px] text-ink-3">
            Hiện chưa có tín hiệu ACTIVE mới từ Forex &amp; Crypto Quant Hub (đang chờ setup xác suất cao).
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableSignals.slice(0, 6).map((sig) => (
              <div
                key={sig.id}
                className="flex flex-col justify-between rounded-xl border border-line/60 bg-surface-elevated/60 p-3.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-ink">{sig.symbol}</span>
                      <span className="rounded-md bg-panel-3 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-2 uppercase">
                        {sig.assetType}
                      </span>
                      {sig.setupGrade && (
                        <Badge tone={sig.setupGrade === "A+" || sig.setupGrade === "A" ? "up" : "warn"}>
                          Grade {sig.setupGrade}
                        </Badge>
                      )}
                    </div>
                    <Badge tone={sig.direction === "BUY" ? "up" : "down"}>
                      {sig.direction === "BUY" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {sig.direction}
                    </Badge>
                  </div>

                  <div className="mt-2.5 space-y-1 text-[11px] rounded-lg bg-surface-primary/70 p-2 border border-line/40">
                    <div className="flex justify-between">
                      <span className="text-ink-3">Entry / SL / TP1</span>
                      <span className="font-mono text-ink">
                        {sig.entryPrice} / <span className="text-down">{sig.stopLossPrice}</span> /{" "}
                        <span className="text-positive">{sig.tp1}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Winrate Score &amp; Size</span>
                      <span className="font-semibold text-ink">
                        {sig.winrateScore.toFixed(0)}% · {sig.recommendedLotsOrMargin}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={dispatchingId === sig.id}
                  onClick={() => handleDispatchSignal(sig)}
                  className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                    dispatchTargetEnv === "REAL"
                      ? "bg-amber-500 text-slate-950"
                      : "bg-accent-primary text-white"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {dispatchingId === sig.id
                    ? "Đang gửi lệnh..."
                    : dispatchTargetEnv === "REAL"
                      ? "Đẩy Lệnh Vào REAL (Tiền Thật)"
                      : dispatchTargetEnv === "DEMO"
                        ? "Đẩy Lệnh Vào DEMO"
                        : "Đẩy Lệnh (REAL + DEMO)"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Connected Broker & Follower Accounts */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-ink">
              Danh Sách Tài Khoản Kết Nối (Encrypted Broker Vault &amp; MT5 Bridge)
            </h3>
            <p className="mt-0.5 text-[11px] text-ink-3">
              API Key Binance/OKX được mã hóa AES-256-GCM tại server. Exness/XM chạy qua Expert Advisor Bearer Token.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-line bg-surface-elevated p-0.5 text-[11px]">
              {(
                [
                  { id: "ALL", label: `Tất cả (${accounts.length})` },
                  { id: "REAL", label: `REAL (${realAccountsList.length})` },
                  { id: "DEMO", label: `DEMO (${demoAccountsList.length})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVaultEnvFilter(opt.id)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    vaultEnvFilter === opt.id
                      ? opt.id === "REAL"
                        ? "bg-amber-500 text-slate-950"
                        : opt.id === "DEMO"
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-accent-primary text-white"
                      : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <a
              href="/ea/OrcaCopyTradeSlave.mq5"
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:bg-panel-3 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-accent-primary" />
              Tải EA MT5 (.mq5)
            </a>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              Kết Nối Sàn / API Key
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-line/50">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-surface-elevated/60 text-[10px] uppercase text-ink-3">
              <tr>
                <th className="px-3 py-2">Tài Khoản &amp; Môi Trường NAV</th>
                <th className="px-3 py-2">Trạng Thái Vault</th>
                <th className="px-3 py-2">NAV Tài Khoản / Risk / Cap</th>
                <th className="px-3 py-2">Auto-Bot (A+/A)</th>
                <th className="px-3 py-2 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30 bg-surface-primary/40">
              {filteredVaultAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-ink-3">
                    Chưa có kết nối nào thuộc nhóm {vaultEnvFilter}. Nhấn &quot;Kết Nối Sàn / API Key&quot; để thêm tài khoản mới.
                  </td>
                </tr>
              ) : (
                filteredVaultAccounts.map((acc) => {
                  const envInfo = classifyAccountEnvironment(acc);
                  const isRealAcc = envInfo.environment === "REAL";
                  return (
                <tr
                  key={acc.id}
                  className={`hover:bg-surface-elevated/40 transition-colors border-l-2 ${
                    isRealAcc ? "border-l-amber-400" : "border-l-cyan-400"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-ink">{acc.name}</span>
                      <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                        {acc.platform}
                      </span>
                      <Badge tone={isRealAcc ? "warn" : "accent"}>
                        {isRealAcc ? "REAL NAV" : demoSubtypeBadgeLabel(envInfo.demoSubtype)}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-mono text-ink-3">
                      ID: {acc.accountNumberMasked} · Đã khớp {acc.totalCopiedTrades} lệnh
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={statusBadgeTone(acc.connectionStatus)}>
                      {statusLabel(acc.connectionStatus)}
                    </Badge>
                    {acc.lastError && (
                      <div className="mt-1 max-w-[220px] truncate text-[10px] text-down" title={acc.lastError}>
                        {acc.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-ink">
                        ${acc.balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`text-[9.5px] font-bold uppercase ${
                          isRealAcc ? "text-amber-400" : "text-cyan-400"
                        }`}
                      >
                        {isRealAcc ? "REAL" : "DEMO"}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-ink-3">
                      {acc.riskMultiplier}x · Lev ≤{acc.leverageCap ?? 5}x · MaxLoss ${acc.maxDailyLossUsd ?? 500}/d
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={acc.killSwitched}
                      onClick={() =>
                        handleTogglePatch(acc.id, { autoExecuteEnabled: !acc.autoExecuteEnabled })
                      }
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors disabled:opacity-40 ${
                        acc.autoExecuteEnabled && !acc.killSwitched
                          ? "bg-positive/15 text-positive border border-positive/30"
                          : "bg-panel-3 text-ink-3 border border-line hover:bg-surface-elevated"
                      }`}
                    >
                      <Zap className="h-3 w-3" />
                      {acc.autoExecuteEnabled && !acc.killSwitched ? "AUTO ON" : "AUTO OFF"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {acc.hasApiKey && getBrokerMeta(acc.platform).supportsDirectRestVerify && (
                          <button
                            type="button"
                            disabled={testingConnId === acc.id}
                            onClick={() => handleTestExistingConnection(acc.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-elevated px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel-3 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${testingConnId === acc.id ? "animate-spin" : ""}`} />
                            Test API
                          </button>
                        )}
                      {!acc.hasApiKey && isMt5BrokerPlatform(acc.platform) && (
                          <button
                            type="button"
                            disabled={rotatingConnId === acc.id}
                            onClick={() => void handleRegenerateEaToken(acc)}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-elevated px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel-3 transition-colors disabled:opacity-50"
                            title="Cấp lại Bearer Token 1 lần cho OrcaCopyTradeSlave.mq5"
                          >
                            <KeyRound className="h-3 w-3 text-warn" />
                            {rotatingConnId === acc.id ? "..." : "EA Token"}
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => handleTogglePatch(acc.id, { isActive: !acc.isActive })}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                          acc.isActive
                            ? "bg-positive/15 text-positive border border-positive/30"
                            : "bg-panel-3 text-ink-3 border border-line hover:bg-surface-elevated"
                        }`}
                      >
                        {acc.isActive ? (
                          <>
                            <PlayCircle className="h-3 w-3" /> Đang bật
                          </>
                        ) : (
                          <>
                            <PauseCircle className="h-3 w-3" /> Tạm dừng
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={deletingConnId === acc.id}
                        onClick={() => void handleDeleteAccount(acc)}
                        aria-label={`Xóa kết nối ${acc.name}`}
                        title="Ngắt kết nối & xóa khóa khỏi Vault"
                        className="inline-flex items-center justify-center rounded-md border border-down/30 bg-down/10 p-1.5 text-down hover:bg-down hover:text-white transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution Audit Stream */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4 shadow-sm">
        <h3 className="text-[13px] font-bold text-ink">
          Nhật Ký Khớp Lệnh Sao Chép (Sub-second Execution &amp; Guardrail Stream)
        </h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line/50">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-surface-elevated/60 text-[10px] uppercase text-ink-3">
              <tr>
                <th className="px-3 py-2">Cặp / Chiều</th>
                <th className="px-3 py-2">Tài Khoản</th>
                <th className="px-3 py-2">Khối Lượng &amp; Giá</th>
                <th className="px-3 py-2">Trạng Thái</th>
                <th className="px-3 py-2">Chi Tiết / Order ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30 bg-surface-primary/40">
              {executionLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-ink-3">
                    Chưa có lệnh thực thi nào trong phiên hiện tại. Nhấn &quot;Đẩy Lệnh (Copy Now)&quot; hoặc bật Auto-Bot để kiểm chứng.
                  </td>
                </tr>
              ) : (
                executionLogs.slice(0, 20).map((log) => (
                  <tr key={log.orderId} className="hover:bg-surface-elevated/40">
                    <td className="px-3 py-2 font-semibold">
                      <span className="text-ink">{log.symbol}</span>{" "}
                      <Badge tone={log.direction === "BUY" ? "up" : "down"}>{log.direction}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-ink">{log.followerName}</div>
                      <div className="text-[10px] text-ink-3">
                        {log.platform} · {log.isTestnet ? "Testnet" : "Live"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-ink">
                      {log.copiedLotsOrQty} @ {log.executionPrice}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={orderStatusTone(log.status)}>{log.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-2">
                      <div>{log.message}</div>
                      {log.exchangeOrderId && (
                        <div className="text-[10px] font-mono text-ink-3">Order #{log.exchangeOrderId}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Exchange / Broker Vault Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface-primary p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink">Kết Nối Sàn Giao Dịch &amp; Broker Vault</h3>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Hỗ trợ Binance USDT-M Futures, OKX v5 Swap (REST API) và Exness / XM (MT5 EA Bridge)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-elevated hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-2">
                  Phân loại thị trường (Crypto Exchanges vs Forex Brokers &amp; Liquidity Hubs)
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "CRYPTO", label: `Sàn Crypto (${CRYPTO_CATALOG.length})` },
                      { id: "FOREX", label: `Sàn Forex (${FOREX_CATALOG.length})` },
                      { id: "NOTIFICATION", label: "Telegram 1-Click" },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setModalCategory(cat.id);
                        const first = BROKER_CATALOG.find((b) => b.category === cat.id);
                        if (first) {
                          setFormPlatform(first.platform);
                          setFormLeverageCap(cat.id === "FOREX" ? 1 : 5);
                        }
                        setModalTestRes(null);
                        setModalDualTestRes(null);
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        modalCategory === cat.id
                          ? "border-accent-primary bg-accent-primary/15 text-ink"
                          : "border-line bg-surface-elevated text-ink-3 hover:text-ink"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-2">
                  Chọn sàn / nhà môi giới ({modalCategory === "CRYPTO" ? "Crypto Exchanges" : modalCategory === "FOREX" ? "Forex Brokers & Hubs" : "Alert Bot"})
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => {
                    const nextPlat = e.target.value as BrokerPlatform;
                    const nextMeta = getBrokerMeta(nextPlat);
                    setFormPlatform(nextPlat);
                    setModalCategory(nextMeta.category);
                    setModalTestRes(null);
                    setModalDualTestRes(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-2 text-[12.5px] text-ink"
                >
                  {BROKER_CATALOG.filter((b) => b.category === modalCategory).map((b) => (
                    <option key={b.platform} value={b.platform}>
                      {b.name} — {b.venueType}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10.5px] text-ink-3">{selectedBrokerMeta.keyFormatHintVi}</p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-2">
                  Phân loại môi trường NAV (Bắt buộc chọn rõ REAL hoặc DEMO)
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormIsTestnet(true);
                      setModalTestRes(null);
                    }}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      formIsTestnet
                        ? "border-cyan-400 bg-cyan-500/15 text-ink shadow-xs"
                        : "border-line bg-surface-elevated/60 text-ink-3 hover:text-ink"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[12px] font-bold">
                      <FlaskConical className="h-3.5 w-3.5 text-cyan-400" />
                      DEMO / TESTNET
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-ink-3">
                      Hạch toán vào nhóm DEMO NAV (Testnet, MT5 Demo, Paper).
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormIsTestnet(false);
                      setModalTestRes(null);
                    }}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      !formIsTestnet
                        ? "border-amber-400 bg-amber-500/15 text-ink shadow-xs"
                        : "border-line bg-surface-elevated/60 text-ink-3 hover:text-ink"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[12px] font-bold">
                      <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                      REAL / LIVE (Tiền Thật)
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-ink-3">
                      Hạch toán vào nhóm REAL NAV · khớp lệnh tiền thật trên sàn.
                    </div>
                  </button>
                </div>
                {!formIsTestnet && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Đang chọn <strong>REAL / LIVE</strong>: Bắt buộc gắn API Key / EA Token thật và kiểm tra giới hạn cắt lỗ ngày trước khi bật Auto-Trade.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-2">Tên gợi nhớ kết nối</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={`Ví dụ: ${PLATFORM_LABELS[formPlatform]} (${formIsTestnet ? "Demo" : "Real"})`}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-2 text-[12.5px] text-ink"
                />
              </div>

              {isRestExchange && (
                <div className="space-y-3 rounded-xl border border-warn/40 bg-warn/5 p-3">
                  <div className="flex items-start gap-2 text-[11px] text-warn">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {selectedBrokerMeta.supportsDualEnv ? (
                        <>
                          <strong>Đồng bộ Dual-Mode ({selectedBrokerMeta.shortName} REAL + DEMO):</strong> Chỉ cần nhập 1 bộ khóa API, hệ thống tự quét{" "}
                          <strong>{selectedBrokerMeta.realEndpointLabel}</strong> và{" "}
                          <strong>{selectedBrokerMeta.demoEndpointLabel}</strong>. Chỉ bật quyền Read/Trade, tuyệt đối <strong>TẮT Withdraw</strong>.
                        </>
                      ) : (
                        <>
                          <strong>{selectedBrokerMeta.name}:</strong> Kết nối tới {selectedBrokerMeta.realEndpointLabel} ·{" "}
                          {selectedBrokerMeta.keyFormatHintVi}
                        </>
                      )}
                    </span>
                  </div>

                  {keyRecognition?.bestMatch && (
                    <div className="rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-2 text-[10.5px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-accent-primary">
                          Nhận diện API Key: {keyRecognition.bestMatch.detectedFormatLabel} ({keyRecognition.bestMatch.confidence}%)
                        </span>
                        {keyRecognition.bestMatch.platform !== formPlatform && (
                          <button
                            type="button"
                            onClick={() => {
                              const target = keyRecognition.bestMatch!.platform;
                              setFormPlatform(target);
                              setModalCategory(getBrokerMeta(target).category);
                              setModalTestRes(null);
                              setModalDualTestRes(null);
                            }}
                            className="rounded-md bg-accent-primary px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-90"
                          >
                            Chuyển sang {getBrokerMeta(keyRecognition.bestMatch.platform).shortName}
                          </button>
                        )}
                      </div>
                      {keyRecognition.warningsVi.length > 0 && (
                        <div className="mt-1 text-amber-300">{keyRecognition.warningsVi[0]}</div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-2">
                      {selectedBrokerMeta.fields.apiKeyLabel}
                    </label>
                    <input
                      type="text"
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      placeholder={selectedBrokerMeta.fields.apiKeyPlaceholder}
                      autoComplete="off"
                      className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-2 font-mono text-[12px] text-ink"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-2">
                      {selectedBrokerMeta.fields.apiSecretLabel}
                    </label>
                    <input
                      type="password"
                      value={formApiSecret}
                      onChange={(e) => setFormApiSecret(e.target.value)}
                      placeholder={selectedBrokerMeta.fields.apiSecretPlaceholder}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-2 font-mono text-[12px] text-ink"
                    />
                  </div>

                  {(selectedBrokerMeta.fields.requiresPassphrase || selectedBrokerMeta.fields.passphraseLabel) && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-2">
                        {selectedBrokerMeta.fields.passphraseLabel ?? "Passphrase"}{" "}
                        {selectedBrokerMeta.fields.requiresPassphrase && <span className="text-down">*</span>}
                      </label>
                      <input
                        type={selectedBrokerMeta.fields.requiresPassphrase ? "password" : "text"}
                        value={formPassphrase}
                        onChange={(e) => setFormPassphrase(e.target.value)}
                        placeholder={selectedBrokerMeta.fields.passphrasePlaceholder ?? "Nhập Passphrase..."}
                        autoComplete="new-password"
                        className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-2 font-mono text-[12px] text-ink"
                      />
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={
                          modalTesting ||
                          !selectedBrokerMeta.supportsDirectRestVerify ||
                          !formApiKey.trim() ||
                          (selectedBrokerMeta.fields.requiresSecret && !formApiSecret.trim())
                        }
                        onClick={handleModalDryTest}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[11.5px] font-semibold text-ink hover:bg-panel-3 disabled:opacity-40"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {modalTesting ? "Đang ping REAL & DEMO..." : "Kiểm tra REAL & DEMO"}
                      </button>
                      {!modalDualTestRes && modalTestRes && (
                        <span
                          className={`text-[11px] font-semibold ${
                            modalTestRes.verified && modalTestRes.canTrade ? "text-positive" : "text-down"
                          }`}
                        >
                          {modalTestRes.verified ? `OK ($${modalTestRes.balanceUsd ?? 0}, ${modalTestRes.latencyMs}ms)` : modalTestRes.rawMessage}
                        </span>
                      )}
                    </div>
                    {modalDualTestRes && (
                      <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-line bg-surface-elevated/80 p-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-amber-300">REAL / LIVE:</span>
                          <span className={modalDualTestRes.real.verified ? "font-semibold text-positive" : "text-ink-3"}>
                            {modalDualTestRes.real.verified
                              ? `OK ($${(modalDualTestRes.real.balanceUsd ?? 0).toLocaleString()}, ${modalDualTestRes.real.latencyMs}ms)`
                              : "Không cấp quyền / Lỗi"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-cyan-300">DEMO / TESTNET:</span>
                          <span className={modalDualTestRes.demo.verified ? "font-semibold text-positive" : "text-ink-3"}>
                            {modalDualTestRes.demo.verified
                              ? `OK ($${(modalDualTestRes.demo.balanceUsd ?? 0).toLocaleString()}, ${modalDualTestRes.demo.latencyMs}ms)`
                              : "Không cấp quyền / Lỗi"}
                          </span>
                        </div>
                        <div className={`pt-1 border-t border-line/60 text-[10.5px] ${modalDualTestRes.anyVerified ? "text-positive" : "text-down"}`}>
                          {modalDualTestRes.summaryMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isMt5Bridge && (
                <div className="space-y-3 rounded-xl border border-accent-primary/35 bg-accent-primary/10 p-3 text-[11.5px] text-ink-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-ink">Phương thức kết nối {PLATFORM_LABELS[formPlatform]}</div>
                    <div className="inline-flex rounded-lg border border-line bg-surface-primary p-0.5 text-[10.5px]">
                      <button
                        type="button"
                        onClick={() => {
                          setFormMt5Mode("metaapi");
                          setModalTestRes(null);
                        }}
                        className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                          formMt5Mode === "metaapi"
                            ? "bg-accent-primary text-white"
                            : "text-ink-3 hover:text-ink"
                        }`}
                      >
                        MetaApi Cloud API (24/7)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormMt5Mode("ea");
                          setModalTestRes(null);
                        }}
                        className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                          formMt5Mode === "ea"
                            ? "bg-accent-primary text-white"
                            : "text-ink-3 hover:text-ink"
                        }`}
                      >
                        MT5 EA Bridge (.mq5)
                      </button>
                    </div>
                  </div>

                  {formMt5Mode === "metaapi" ? (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-ink-2">
                        Gắn <strong>MetaApi Cloud Token</strong> &amp; <strong>Account ID</strong> liên kết tài khoản{" "}
                        <strong>Exness / XM MT5</strong> ({formIsTestnet ? "DEMO" : "REAL LIVE"}) của bạn để Orca đặt lệnh trực tiếp 24/7 trên server.
                      </p>
                      <div>
                        <label className="block text-[11px] font-semibold text-ink-2">MetaApi Auth Token</label>
                        <input
                          type="password"
                          value={formApiKey}
                          onChange={(e) => setFormApiKey(e.target.value)}
                          placeholder="Dán MetaApi API Token (JWT)..."
                          autoComplete="new-password"
                          className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 font-mono text-[12px] text-ink"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-ink-2">MetaApi Account ID</label>
                        <input
                          type="text"
                          value={formApiSecret}
                          onChange={(e) => setFormApiSecret(e.target.value)}
                          placeholder="VD: 1a2b3c4d-5e6f-7890-abcd-ef1234567890"
                          autoComplete="off"
                          className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 font-mono text-[12px] text-ink"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-ink-2">
                          Hậu tố mã sàn (tùy chọn — VD: <code className="font-mono">m</code> cho Exness,{" "}
                          <code className="font-mono">#</code> cho XM)
                        </label>
                        <input
                          type="text"
                          value={formPassphrase}
                          onChange={(e) => setFormPassphrase(e.target.value)}
                          placeholder="Để trống nếu mã chuẩn XAUUSD / EURUSD"
                          className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 font-mono text-[12px] text-ink"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={modalTesting || !formApiKey.trim() || !formApiSecret.trim()}
                          onClick={handleModalDryTest}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[11.5px] font-semibold text-ink hover:bg-panel-3 disabled:opacity-40"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {modalTesting ? "Đang ping MetaApi..." : "Kiểm tra kết nối Exness/XM"}
                        </button>
                        {modalTestRes && (
                          <span
                            className={`text-[11px] font-semibold ${
                              modalTestRes.verified && modalTestRes.canTrade ? "text-positive" : "text-down"
                            }`}
                          >
                            {modalTestRes.verified
                              ? `OK ($${modalTestRes.balanceUsd ?? 0}, ${modalTestRes.latencyMs}ms)`
                              : modalTestRes.rawMessage}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p>
                        Không cần dịch vụ trung gian: Sau khi bấm lưu, hệ thống cấp{" "}
                        <strong>MT5 EA Bearer Token (1 lần duy nhất)</strong> để dán vào file{" "}
                        <code className="font-mono text-ink">OrcaCopyTradeSlave.mq5</code> trên MetaTrader 5 (Exness / XM).
                      </p>
                      <div>
                        <label className="block text-[11px] font-semibold text-ink-2">Số tài khoản MT5 (tùy chọn)</label>
                        <input
                          type="text"
                          value={formAccount}
                          onChange={(e) => setFormAccount(e.target.value)}
                          placeholder="VD: 204958102"
                          className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 font-mono text-[12px] text-ink"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-2">Vốn phân bổ (USD)</label>
                  <input
                    type="number"
                    min={10}
                    value={formBalance}
                    onChange={(e) => setFormBalance(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-2">Hệ số rủi ro (Risk Multiplier)</label>
                  <input
                    type="number"
                    step="any"
                    min={0.1}
                    max={5}
                    value={formRiskMult}
                    onChange={(e) => setFormRiskMult(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-2">Ngắt lỗ tối đa/ngày ($)</label>
                  <input
                    type="number"
                    min={10}
                    value={formMaxDailyLoss}
                    onChange={(e) => setFormMaxDailyLoss(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-2">Trần đòn bẩy (1x - 20x)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formLeverageCap}
                    onChange={(e) => setFormLeverageCap(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] text-ink"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-2">Max Slippage (Pips / %)</label>
                  <input
                    type="number"
                    step="any"
                    min={0.1}
                    max={25}
                    value={formSlippage}
                    onChange={(e) => setFormSlippage(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] text-ink"
                  />
                </div>
                <label className="mt-4 flex items-center gap-2 text-[11.5px] font-semibold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAutoExecute}
                    onChange={(e) => setFormAutoExecute(e.target.checked)}
                    className="rounded border-line"
                  />
                  Bật Auto-Trade kèo A+/A
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-line bg-surface-elevated px-3.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-panel-3"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="rounded-lg bg-accent-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {modalSaving ? "Đang mã hóa & Lưu..." : "Lưu Vào Broker Vault"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-time MT5 EA Bearer Token Modal */}
      {eaTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-warn/50 bg-surface-primary p-5 shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-warn" />
                <h3 className="text-base font-bold text-ink">EA Bearer Token (Hiển Thị 1 Lần)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại EA Token"
                onClick={() => setEaTokenModal(null)}
                className="rounded p-1 text-ink-3 hover:bg-surface-elevated"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[12px] text-ink-2">
              Token dùng để xác thực EA <strong>OrcaCopyTradeSlave.mq5</strong> cho tài khoản{" "}
              <strong>{eaTokenModal.name}</strong> ({eaTokenModal.platform}). Server chỉ lưu bản băm SHA-256 nên sẽ{" "}
              <span className="text-down font-semibold">không thể xem lại token này sau khi đóng</span>.
            </p>

            <div className="rounded-lg border border-line bg-surface-elevated p-2.5 font-mono text-[11.5px] break-all text-positive">
              {eaTokenModal.token}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(eaTokenModal.token);
                  setCopiedEaToken(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedEaToken ? "Đã Copy!" : "Copy Bearer Token"}
              </button>
              <a
                href="/ea/OrcaCopyTradeSlave.mq5"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] font-semibold text-ink"
              >
                <Download className="h-3.5 w-3.5" />
                Tải .mq5
              </a>
              <button
                type="button"
                onClick={() => setEaTokenModal(null)}
                className="rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-panel-3"
              >
                Đã lưu &amp; Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
