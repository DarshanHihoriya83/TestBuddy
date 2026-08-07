import type { ReactNode } from "react";
import type { Bug } from "../types";
import { priorityTone, severityTone, statusLabel, statusTone } from "../utils/bugUi";
import { CommandHeader } from "./CommandHeader";

function BugDetailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3v3M12 21v-3M3 12h3M21 12h-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BugDetailCommandHeader({
  bug,
  actions,
}: {
  bug: Bug;
  actions: ReactNode;
}) {
  return (
    <CommandHeader
      className="tb-bug-command-header"
      icon={<BugDetailIcon />}
      title={bug.title}
      meta={
        <>
          <span className={`tb-bug-header-chip ${statusTone(bug.status)}`}>{statusLabel(bug.status)}</span>
          <span className={`tb-bug-header-chip ${priorityTone(bug.priority)}`}>{bug.priority}</span>
          <span className={`tb-bug-header-chip ${severityTone(bug.severity)}`}>{bug.severity}</span>
        </>
      }
      actions={actions}
    />
  );
}
