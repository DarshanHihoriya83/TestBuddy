import { Navigate } from "react-router-dom";

/** @deprecated Use /settings — kept for old bookmarks. */
export function ProfilePage() {
  return <Navigate to="/settings" replace />;
}
