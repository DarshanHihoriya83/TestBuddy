/**
 * Marks a response as never cacheable.
 *
 * Used on the two routes that hand back a plaintext temporary password, so the
 * credential is not retained by the browser's back/forward cache or by any
 * intermediary that would otherwise treat the JSON as cacheable.
 */
export function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}
