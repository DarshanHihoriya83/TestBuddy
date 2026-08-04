export function QueryStatus({
  isLoading,
  error,
  onRetry,
  loadingText = "Loading…",
  className = "mb-4",
}: {
  isLoading?: boolean;
  error?: Error | null | unknown;
  onRetry?: () => void;
  loadingText?: string;
  className?: string;
}) {
  if (isLoading) {
    return <p className={`text-sm text-[var(--muted)] ${className}`}>{loadingText}</p>;
  }
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className={`tb-alert-error flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="tb-btn-ghost bg-white px-3 py-1 text-xs"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
