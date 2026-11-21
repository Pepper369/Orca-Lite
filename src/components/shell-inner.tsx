"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type MouseEvent,
} from "react";
import { markAppNavigating } from "@/lib/hooks";
import { prefetchRouteApis } from "@/lib/nav-prefetch";
import { RouteProgress, signalNavStart } from "@/components/route-progress";
import {
  Activity,
  BookOpen,
  Bot,
  Boxes,
  CandlestickChart,
  ChartNoAxesCombined,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  Cpu,
  DollarSign,
  Eye,
  FlaskConical,
  Globe2,
  Grid2x2,
  Home,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Newspaper,
  PiggyBank,
  Calculator,
  HeartPulse,
  Server,
  Sparkles,
  Target,
  FileText,
  Settings,
  Users,
  X,
} from "lucide-react";
import { TickerTape } from "@/components/ticker-tape";
import { GlobalSearch } from "@/components/search";
import { OrcaWordmark, OrcaMark, OrcaMobileBrand } from "@/components/logo";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { useApi } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import { sanitizeImageSrc } from "@/lib/security/xss";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotifBell } from "@/components/notif-bell";
import { PriceAlertEngine } from "@/components/price-alert-engine";
import { AiAssistantWidget } from "@/components/ai-assistant-widget";

const SIDEBAR_EXPANDED = 268;
const SIDEBAR_COLLAPSED = 60;

const NAV_SECTIONS: {
  title: string;
  items: {
    href: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    core?: boolean;
  }[];
}[] = [
  {
    title: "TRUNG TÂM",
    items: [
      { href: "/", label: "Tổng quan", icon: Home, core: true },
      { href: "/terminal", label: "Pro Terminal (0ms)", icon: Monitor, core: true },
      { href: "/agent", label: "Trợ lý AI", icon: Sparkles, core: true },
    ],
  },
  {
    title: "THỊ TRƯỜNG",
    items: [
      { href: "/stocks", label: "Cổ phiếu VN", icon: CandlestickChart, core: true },
      { href: "/derivatives", label: "Phái sinh VN30F", icon: Activity, core: true },
      { href: "/forex", label: "Ngoại hối & Vàng", icon: DollarSign, core: true },
      { href: "/crypto", label: "Tiền mã hóa", icon: Coins, core: true },
      { href: "/commodities", label: "Hàng hóa", icon: Boxes },
    ],
  },
  {
    title: "PHÂN TÍCH & QUANT",
    items: [
      { href: "/screener", label: "Bộ lọc đa tài sản", icon: FlaskConical, core: true },
      { href: "/stocks/sectors", label: "Dòng tiền ngành", icon: Layers, core: true },
      { href: "/heatmap", label: "Bản đồ nhiệt", icon: Grid2x2 },
      { href: "/quant", label: "AI Quant & Bot", icon: Cpu, core: true },
      { href: "/copytrade", label: "Auto-Trade & API Sàn", icon: KeyRound, core: true },
    ],
  },
  {
    title: "VĨ MÔ & TIN TỨC",
    items: [
      { href: "/macro-economic", label: "Kinh tế vĩ mô", icon: ChartNoAxesCombined },
      { href: "/currency-interest-rate", label: "Lãi suất & Tiền tệ", icon: Landmark },
      { href: "/earnings", label: "Lịch BCTC & TT96", icon: FileText },
      { href: "/news", label: "Tin tức", icon: Newspaper },
      { href: "/reports", label: "Bản tin phân tích", icon: Globe2 },
    ],
  },
  {
    title: "QUẢN TRỊ",
    items: [
      { href: "/portfolio", label: "Danh mục thông minh", icon: LayoutDashboard, core: true },
      { href: "/watchlist", label: "Danh mục theo dõi", icon: Eye },
      { href: "/journal", label: "Nhật ký giao dịch", icon: BookOpen },
      { href: "/system", label: "Trạng thái hệ thống", icon: Server },
    ],
  },
];

const PERSONAL_FINANCE_NAV: typeof NAV_SECTIONS = [
  {
    title: "TÀI CHÍNH CÁ NHÂN",
    items: [
      { href: "/personal-finance#dashboard", label: "Tổng quan", icon: Home },
      { href: "/personal-finance#checkin", label: "Monthly check-in", icon: ClipboardList },
      { href: "/personal-finance#cashflow_calc", label: "Dòng tiền & thuế", icon: Calculator },
      { href: "/personal-finance#analytics", label: "Phân tích tài chính", icon: ChartNoAxesCombined },
      { href: "/personal-finance#planning", label: "Kế hoạch & hưu trí", icon: Target },
      { href: "/personal-finance#advice", label: "Lời khuyên", icon: HeartPulse },
      { href: "#ask_orca", label: "Hỏi ORCA AI", icon: Bot },
      { href: "/personal-finance#report", label: "Báo cáo", icon: FileText },
      { href: "/personal-finance#privacy", label: "Quyền riêng tư", icon: PiggyBank },
    ],
  },
  { title: "TÀI KHOẢN", items: [{ href: "/settings", label: "Cài đặt", icon: Settings }] },
];

interface DesktopNavItemProps {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onNav: (href: string, e?: MouseEvent<HTMLElement>) => void;
  onHover: (href: string) => void;
}

function DesktopNavItem({
  href,
  label,
  icon: Icon,
  active,
  onNav,
  onHover,
}: DesktopNavItemProps) {
  return (
    <Link
      href={href}
      suppressHydrationWarning
      prefetch={true}
      onClick={(e) => onNav(href, e)}
      onMouseEnter={() => onHover(href)}
      onTouchStart={() => onHover(href)}
      className={
        "orca-nav-item group relative flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] leading-none " +
        (active
          ? "bg-accent-primary/15 font-medium text-accent-primary"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary")
      }
      title={label}
    >
      <Icon className="size-4 shrink-0 opacity-90" />
      <span className="orca-nav-item-label min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

interface MobileNavItemProps extends DesktopNavItemProps {
  onClose: () => void;
}

function MobileNavItem({
  href,
  label,
  icon: Icon,
  active,
  onNav,
  onHover,
  onClose,
}: MobileNavItemProps) {
  return (
    <Link
      href={href}
      suppressHydrationWarning
      prefetch={true}
      onClick={(e) => {
        onNav(href, e);
        onClose();
      }}
      onMouseEnter={() => onHover(href)}
      onTouchStart={() => onHover(href)}
      className={
        "orca-nav-item group relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[14px] leading-none " +
        (active
          ? "bg-accent-primary/15 font-medium text-accent-primary"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary")
      }
      title={label}
    >
      <Icon className="size-4 shrink-0 opacity-90" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string, activePersonalTab: string) {
  const [path, hash] = href.split("#");
  if (hash) return pathname === path && activePersonalTab === hash;
  if (path === "/") return pathname === "/";
  if (path === "/stocks" && pathname.startsWith("/stocks/sectors")) return false;
  return pathname === path || pathname.startsWith(path + "/");
}

export function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPersonalFinanceMode = pathname.startsWith("/personal-finance");
  const isFullViewport = pathname === "/agent";
  const isLgFullViewport = pathname === "/terminal";
  const activeNavSections = isPersonalFinanceMode ? PERSONAL_FINANCE_NAV : NAV_SECTIONS;
  const [activePersonalTab, setActivePersonalTab] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sideAnimating, setSideAnimating] = useState(false);
  const sideAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    try {
      const v = localStorage.getItem("orca:sidebar:collapsed");
      if (v === "1") window.setTimeout(() => setCollapsed(true), 0);
    } catch {
      /* ignore */
    }
    return () => {
      if (sideAnimTimer.current) clearTimeout(sideAnimTimer.current);
    };
  }, []);

  useEffect(() => {
    const syncTab = (event?: Event) => {
      const requestedTab = event instanceof CustomEvent ? (event.detail as string) : window.location.hash.slice(1);
      setActivePersonalTab(requestedTab || "dashboard");
    };
    window.setTimeout(() => syncTab(), 0);
    window.addEventListener("hashchange", syncTab);
    window.addEventListener("orca:personal-finance-tab", syncTab);
    return () => {
      window.removeEventListener("hashchange", syncTab);
      window.removeEventListener("orca:personal-finance-tab", syncTab);
    };
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setSideAnimating(true);
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("orca:sidebar:collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
    if (sideAnimTimer.current) clearTimeout(sideAnimTimer.current);
    sideAnimTimer.current = setTimeout(() => setSideAnimating(false), 340);
  }, []);

  const onNav = useCallback(
    (href: string, e?: MouseEvent<HTMLElement>) => {
      if (href === "#ask_orca") {
        if (e) e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("orca:open-ai-widget", {
            detail: { mode: "finance" },
          }),
        );
        return;
      }
      const hashTab = href.split("#")[1];
      if (hashTab) {
        if (e) e.preventDefault();
        window.dispatchEvent(new CustomEvent("orca:personal-finance-tab", { detail: hashTab }));
        return;
      }
      signalNavStart();
    },
    [],
  );

  const onHover = useCallback(
    (href: string) => {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
      // P4-A: warm route APIs on hover
      prefetchRouteApis(href);
    },
    [router],
  );

  const renderDesktopSidebar = () => {
    return (
      <div className="orca-sidebar flex h-full flex-col" style={{ width: SIDEBAR_EXPANDED }}>
        <div className="orca-sidebar-header relative flex min-h-[3.25rem] shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-2">
          <Link
            href={isPersonalFinanceMode ? "/personal-finance" : "/"}
            onClick={(e) => onNav(isPersonalFinanceMode ? "/personal-finance" : "/", e)}
            className="orca-sidebar-logo grid size-9 shrink-0 place-items-center rounded-lg"
            title={isPersonalFinanceMode ? "ORCA Personal Finance" : "ORCA Financial"}
          >
            <OrcaMark size={30} />
          </Link>
          <Link
            href={isPersonalFinanceMode ? "/personal-finance" : "/"}
            onClick={(e) => onNav(isPersonalFinanceMode ? "/personal-finance" : "/", e)}
            className="orca-sidebar-brand-text min-w-0 flex-1 overflow-hidden mr-10"
            title={isPersonalFinanceMode ? "ORCA Personal Finance" : "ORCA Financial"}
          >
            <span className="block truncate text-[13px] font-bold tracking-wide text-text-primary">
              ORCA<span className="text-accent-primary"> {isPersonalFinanceMode ? "PERSONAL" : "FINANCIAL"}</span>
            </span>
            <span className="block truncate text-[9px] font-medium uppercase tracking-[0.06em] text-text-muted">
              {isPersonalFinanceMode ? "Personal Finance" : "Intelligent Investment"}
            </span>
          </Link>
        </div>

        <nav
          suppressHydrationWarning
          className="orca-sidebar-nav min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-2 py-2.5"
        >
          {activeNavSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <div className="orca-sidebar-section-title px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {section.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <DesktopNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActivePath(pathname, item.href, activePersonalTab)}
                    onNav={onNav}
                    onHover={onHover}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border-subtle p-2">
          <UserMenu collapsed={false} />
        </div>
      </div>
    );
  };

  const renderMobileSidebar = () => {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-3.5">
          <Link
            href={isPersonalFinanceMode ? "/personal-finance" : "/"}
            onClick={(e) => {
              onNav(isPersonalFinanceMode ? "/personal-finance" : "/", e);
              setMobileOpen(false);
            }}
            className="min-w-0 flex-1"
            title={isPersonalFinanceMode ? "ORCA Personal Finance" : "ORCA Financial"}
          >
            <OrcaMobileBrand />
          </Link>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav
          suppressHydrationWarning
          className="orca-sidebar-nav min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2.5 py-3"
        >
          {activeNavSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {section.title}
              </div>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <MobileNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActivePath(pathname, item.href, activePersonalTab)}
                    onNav={onNav}
                    onHover={onHover}
                    onClose={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-border-subtle p-3">
          <UserMenu collapsed={false} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary text-text-primary">
      <RouteProgress />
      {!isPersonalFinanceMode && <PriceAlertEngine />}
      {!isPersonalFinanceMode && (
        <div className="sticky top-0 z-30 shrink-0 border-b border-border-subtle bg-surface-base">
          <TickerTape />
        </div>
      )}
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside
          className={
            "orca-aside relative hidden h-full shrink-0 border-r border-border-subtle bg-surface-base md:block " +
            (sideAnimating ? "is-collapsing " : "") +
            (collapsed ? "is-collapsed" : "is-expanded")
          }
          style={{
            width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
          }}
        >
          {renderDesktopSidebar()}
          <button
            type="button"
            className={
              "orca-sidebar-toggle absolute z-20 grid size-8 place-items-center rounded-md border border-border-subtle/80 bg-surface-base text-text-muted shadow-sm transition-colors hover:bg-surface-elevated hover:text-text-primary " +
              (collapsed ? "left-1/2 top-[3.35rem] -translate-x-1/2" : "right-2 top-2.5")
            }
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </aside>

        <div
          className={
            "fixed inset-0 z-50 md:hidden " +
            (mobileOpen ? "pointer-events-auto" : "pointer-events-none")
          }
          aria-hidden={!mobileOpen}
        >
          <button
            type="button"
            className={
              "orca-drawer-backdrop absolute inset-0 bg-black/50 " +
              (mobileOpen ? "opacity-100" : "opacity-0")
            }
            aria-label="Đóng menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={
              "orca-drawer absolute left-0 top-0 flex h-full w-[min(320px,94vw)] flex-col overflow-hidden bg-surface-base pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl " +
              (mobileOpen ? "translate-x-0" : "-translate-x-full")
            }
          >
            {renderMobileSidebar()}
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-1.5 sm:gap-2 border-b border-border-subtle bg-surface-base/95 backdrop-blur-md px-2.5 sm:px-3 sticky top-0 z-30">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-all hover:bg-surface-elevated active:scale-95 md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Mở menu"
              >
                <Menu className="size-4.5" />
              </button>
              <div className="flex shrink-0 items-center rounded-lg border border-border-subtle bg-surface-elevated/70 p-0.5 text-[11px] sm:text-xs">
                <button
                  type="button"
                  aria-pressed={!isPersonalFinanceMode}
                  onClick={() => router.push("/")}
                  className={
                    !isPersonalFinanceMode
                      ? "rounded-md bg-accent-primary/20 px-2 sm:px-2.5 py-1 sm:py-1.5 font-bold text-accent-primary shadow-xs"
                      : "rounded-md px-2 sm:px-2.5 py-1 sm:py-1.5 text-text-muted hover:text-text-primary"
                  }
                >
                  <span className="sm:hidden">Đầu tư</span>
                  <span className="hidden sm:inline">Đầu tư</span>
                </button>
                <button
                  type="button"
                  aria-pressed={isPersonalFinanceMode}
                  onClick={() => router.push("/personal-finance")}
                  className={
                    isPersonalFinanceMode
                      ? "rounded-md bg-amber-400/20 px-2 sm:px-2.5 py-1 sm:py-1.5 font-bold text-amber-300 shadow-xs"
                      : "rounded-md px-2 sm:px-2.5 py-1 sm:py-1.5 text-text-muted hover:text-text-primary"
                  }
                >
                  <span className="sm:hidden">Cá nhân</span>
                  <span className="hidden sm:inline">Tài chính cá nhân</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 min-w-0 justify-end flex-1">
              {!isPersonalFinanceMode ? (
                <>
                  <div className="min-w-0 flex-1 max-w-xs flex justify-end">
                    <GlobalSearch />
                  </div>
                  <Link
                    href="/copytrade"
                    onClick={(e) => onNav("/copytrade", e)}
                    onMouseEnter={() => onHover("/copytrade")}
                    className={
                      "hidden sm:inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold transition-colors whitespace-nowrap " +
                      (pathname.startsWith("/copytrade")
                        ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                        : "border-border-subtle bg-surface-elevated/70 text-text-secondary hover:border-accent-primary/40 hover:text-text-primary")
                    }
                    title="Kết nối API Binance, OKX, Exness, XM & Auto-Trade"
                  >
                    <KeyRound className="size-3.5 text-accent-primary" />
                    <span>API Sàn</span>
                  </Link>
                  <NotifBell />
                  <Link
                    href="/settings"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary active:scale-95"
                    aria-label="Cài đặt"
                  >
                    <Settings className="size-4" />
                  </Link>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Link
                    href="/personal-finance#checkin"
                    onClick={(e) => onNav("/personal-finance#checkin", e)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-semibold hover:bg-amber-400/25 active:scale-95 transition-all"
                  >
                    <ClipboardList className="size-3 text-amber-300" />
                    <span>Check-in</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary active:scale-95"
                    aria-label="Cài đặt"
                  >
                    <Settings className="size-4" />
                  </Link>
                </div>
              )}
            </div>
          </header>
          <main
            className={
              "orca-main-scroll min-h-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0 " +
              (isFullViewport
                ? "overflow-hidden flex flex-col h-full"
                : isLgFullViewport
                  ? "overflow-y-auto lg:overflow-hidden lg:flex lg:flex-col lg:h-full"
                  : "overflow-y-auto")
            }
          >
              <ErrorBoundary name="page" resetKey={pathname}>
                <div
                  key={pathname}
                  className={
                    "orca-page-transition " +
                    (isFullViewport
                      ? "flex-1 min-h-0 flex flex-col h-full p-1.5 sm:p-2.5 overflow-hidden"
                      : isLgFullViewport
                        ? "p-1.5 sm:p-2.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:h-full lg:overflow-hidden"
                        : "p-2 sm:p-3.5 max-w-[1600px] mx-auto w-full")
                  }
                >
                  {children}
                </div>
              </ErrorBoundary>
            </main>
        </div>
      </div>
      <MobileBottomNav
        isPersonalFinanceMode={isPersonalFinanceMode}
        pathname={pathname}
        activePersonalTab={activePersonalTab}
        onOpenDrawer={() => setMobileOpen(true)}
        onNav={onNav}
      />
      <AiAssistantWidget />
    </div>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: me, mutate } = useApi<{
    user: { email: string; name: string | null };
    tradingAccounts?: {
      totalApiAccounts: number;
      cryptoAccountsCount: number;
      forexAccountsCount: number;
    };
  }>("/api/v1/auth/me");

  useEffect(() => {
    const onDoc = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const displayName =
    settings.profile.displayName || me?.user?.name || me?.user?.email?.split("@")[0] || "";
  const initials = displayName.slice(0, 2).toUpperCase() || "?";
  const safeAvatarUrl = sanitizeImageSrc(settings.profile.avatarUrl, {
    allowSafeDataImage: true,
  });

  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    void mutate();
    router.push("/login");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-elevated"
      >
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border-subtle bg-surface-elevated text-[11px] font-bold">
          {safeAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safeAvatarUrl} alt="" className="size-full object-cover" />
          ) : settings.profile.avatarStyle === "orca" && me?.user ? (
            <OrcaMark size={28} className="rounded-md" />
          ) : me?.user ? (
            initials
          ) : (
            "?"
          )}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
            {me?.user ? displayName || me.user.email : "Đăng nhập"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-xl border border-border-default bg-surface-modal shadow-2xl">
          {me?.user ? (
            <>
              <div className="border-b border-border-subtle px-3 py-2.5">
                <div className="truncate text-[12.5px] font-semibold">{displayName || me.user.email}</div>
                <div className="truncate text-[10.5px] text-text-muted">{me.user.email}</div>
                <Link
                  href="/copytrade"
                  onClick={() => setOpen(false)}
                  className="mt-2 flex items-center justify-between gap-1.5 rounded-md border border-border-subtle bg-surface-elevated/80 px-2 py-1 text-[10.5px] hover:border-accent-primary/50 transition-colors"
                >
                  <span className="text-amber-300 font-semibold">
                    Crypto: {me.tradingAccounts?.cryptoAccountsCount ?? 0} TK
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-emerald-300 font-semibold">
                    Forex: {me.tradingAccounts?.forexAccountsCount ?? 0} TK
                  </span>
                </Link>
              </div>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-text-secondary hover:bg-surface-elevated"
              >
                <Settings className="size-3.5" /> Cài đặt
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] text-negative hover:bg-surface-elevated"
              >
                <LogOut className="size-3.5" /> Đăng xuất
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-[12.5px] text-accent-primary hover:bg-surface-elevated"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
