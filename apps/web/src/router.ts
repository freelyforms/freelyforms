import { useEffect, useState } from "react";

/** The app lives under /app/; routes are paths below it. */
export const BASE = "/app";

export type Route =
  { name: "forms" } | { name: "form"; id: string } | { name: "account" } | { name: "notFound" };

export function parseRoute(pathname: string): Route {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  if (path === "" || path === "/") return { name: "forms" };
  if (path === "/account" || path === "/account/") return { name: "account" };
  const form = /^\/forms\/(frm_[A-Za-z0-9]{6,32})\/?$/.exec(path);
  if (form?.[1]) return { name: "form", id: form[1] };
  return { name: "notFound" };
}

export const href = (path: string) => `${BASE}${path}`;

let leaveGuard: (() => boolean) | null = null;

/** A page with unsaved work can veto in-app navigation (returns false to stay). */
export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

export function navigate(path: string): void {
  if (leaveGuard && !leaveGuard()) return;
  window.history.pushState(null, "", href(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}
