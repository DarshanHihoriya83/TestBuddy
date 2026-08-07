/** Browser · OS · host snapshot for bug capture metadata. */
export function detectEnvironmentSnapshot(hostname?: string): string {
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let host = (hostname ?? "").trim();
  if (!host) {
    try {
      host = globalThis.location?.hostname ?? "";
    } catch {
      host = "";
    }
  }
  if (!host) host = "unknown host";

  return `${browser} · ${os} · ${host}`;
}

export function hostnameFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
