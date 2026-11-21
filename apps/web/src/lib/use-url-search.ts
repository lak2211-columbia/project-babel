"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const URL_CHANGE_EVENT = "babel:urlchange";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(URL_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(URL_CHANGE_EVENT, callback);
  };
}

function getClientSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerSearch(): string {
  return "";
}

/**
 * SSR-safe, ISR-compatible URL query reader powered by useSyncExternalStore.
 * Unlike reading useSearchParams() directly in page subtrees, this never forces
 * a Suspense bailout during static/ISR prerendering, so full SSR HTML is emitted.
 */
export function useUrlSearch(): string {
  return useSyncExternalStore(subscribe, getClientSearch, getServerSearch);
}

export function replaceUrlQuery(
  updater: (params: URLSearchParams) => void,
): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  updater(params);
  const qs = params.toString();
  const nextUrl = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

/**
 * Tiny isolated observer mounted inside <Suspense fallback={null}> in RootLayout.
 * Notifies useUrlSearch() listeners whenever Next.js client <Link> navigations
 * update the pathname or search params (including same-route query resets).
 */
export function UrlSearchBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  }, [key]);

  return null;
}
