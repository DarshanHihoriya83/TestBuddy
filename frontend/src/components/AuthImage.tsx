import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** Loads a protected screenshot with the JWT and shows it as an object URL. */
export function AuthImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    const token = localStorage.getItem("testbuddy_token");
    setFailed(false);
    setObjectUrl(null);

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}${src}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (revoked) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        if (!revoked) setFailed(true);
      }
    })();

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-[var(--input-bg)] text-xs text-[var(--muted)] ${className ?? ""}`}>
        Screenshot unavailable
      </div>
    );
  }
  if (!objectUrl) {
    return (
      <div className={`flex items-center justify-center bg-[var(--input-bg)] text-xs text-[var(--muted)] ${className ?? ""}`}>
        Loading…
      </div>
    );
  }
  return <img src={objectUrl} alt={alt} className={className} />;
}
