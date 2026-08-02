/** Shared logout signal — avoids circular imports between api.ts and auth.tsx */

export function clearAuthStorage() {
  localStorage.removeItem("testbuddy_token");
  localStorage.removeItem("testbuddy_user");
}

export function forceLogout() {
  clearAuthStorage();
  window.dispatchEvent(new Event("testbuddy:unauthorized"));
}
