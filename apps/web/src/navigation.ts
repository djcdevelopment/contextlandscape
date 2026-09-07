const PUBLIC_MOUNT = "/landscape/";

export function appMountPath(pathname = window.location.pathname): string {
  return pathname === "/landscape" || pathname.startsWith(PUBLIC_MOUNT) ? PUBLIC_MOUNT : "/";
}

export function appHref(query = "", pathname = window.location.pathname): string {
  const normalized = query.replace(/^\?/, "");
  return normalized ? `${appMountPath(pathname)}?${normalized}` : appMountPath(pathname);
}

/** Scenario invitations and friend duels use different ID namespaces. */
export function isLegacyRoute(search: URLSearchParams): boolean {
  return search.get("view") === "legacy" || search.has("labSession") || search.has("labs") || Boolean(search.get("challenge")?.startsWith("challenge_"));
}
