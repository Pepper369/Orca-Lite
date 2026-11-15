import { useState, useEffect } from "react";

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"));
  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  return pathname;
}

export function useRouter() {
  return {
    push: (href: string, _options?: { scroll?: boolean }) => {
      window.history.pushState(null, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    replace: (href: string, _options?: { scroll?: boolean }) => {
      window.history.replaceState(null, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    refresh: () => {
      window.dispatchEvent(new CustomEvent("orca:refresh"));
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: (_href: string) => {},
  };
}

export function useSearchParams(): URLSearchParams {
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()
  );
  useEffect(() => {
    const handlePopState = () => setSearch(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  return search;
}

export function useParams(): Record<string, string> {
  const p = typeof window !== "undefined" ? window.location.pathname : "";
  const segments = p.split("/").filter(Boolean);
  if (segments[0] === "stocks" && segments[1]) {
    return { symbol: segments[1].toUpperCase() };
  }
  return {};
}

export function redirect(url: string): never {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
  throw new Error(`NEXT_REDIRECT: ${url}`);
}
