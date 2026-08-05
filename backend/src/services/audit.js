/**
 * Security audit trail.
 *
 * Privileged actions on other people's accounts need to be attributable after
 * the fact. Emitted as one structured line per event so a log shipper can index
 * it; never include the credential itself.
 */
export function logSecurityEvent(event, details = {}) {
  const entry = {
    type: "security",
    event,
    at: new Date().toISOString(),
    ...details,
  };
  console.log(JSON.stringify(entry));
}

/** Best-effort client address for audit lines behind a proxy. */
export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}
