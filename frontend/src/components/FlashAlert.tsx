export function FlashAlert({
  error,
  message,
  className = "mb-4",
}: {
  error?: string | null;
  message?: string | null;
  className?: string;
}) {
  if (!error && !message) return null;
  return (
    <div className={className}>
      {error ? <p className="tb-alert-error">{error}</p> : null}
      {message ? <p className={`tb-alert-success${error ? " mt-2" : ""}`}>{message}</p> : null}
    </div>
  );
}
