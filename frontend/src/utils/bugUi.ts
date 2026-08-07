export function statusTone(status: string) {
  switch (status) {
    case "FIXED":
    case "VERIFIED":
    case "CLOSED":
      return "bg-[var(--success-soft)] text-[var(--success)]";
    case "IN_PROGRESS":
    case "OPEN":
      return "bg-[var(--accent-soft)] text-[var(--accent)]";
    case "REOPENED":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function priorityTone(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function severityTone(severity: string) {
  switch (severity) {
    case "BLOCKER":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    case "CRITICAL":
      return "bg-orange-100 text-orange-800";
    case "MAJOR":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}
