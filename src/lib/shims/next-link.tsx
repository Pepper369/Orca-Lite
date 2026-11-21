import React from "react";
import { sanitizeHref } from "@/lib/security/xss";

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  prefetch?: boolean;
}

export default function Link({ href, children, onClick, prefetch, ...rest }: LinkProps) {
  const safeHref = sanitizeHref(href);
  const blockedUnsafe = safeHref === "#" && typeof href === "string" && href.trim() !== "#";

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (blockedUnsafe) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      if (safeHref.startsWith("/") && !safeHref.startsWith("//")) {
        e.preventDefault();
        window.history.pushState(null, "", safeHref);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  };

  return (
    <a href={safeHref} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
