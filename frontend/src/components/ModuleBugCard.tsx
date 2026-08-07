import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createBugComment,
  deleteBugComment,
  fetchBugComments,
  updateBug,
  updateBugStatus,
} from "../api";
import { useAuth } from "../auth";
import { queryKeys } from "../queryKeys";
import type {
  Bug,
  BugPriority,
  BugSeverity,
  BugStatus,
  Cycle,
  Module,
  Step,
  StepActionType,
  User,
} from "../types";
import { priorityTone, severityTone, statusLabel, statusTone } from "../utils/bugUi";
import { copyText } from "../utils/clipboard";
import { BugScreenshots, BugStepsTable } from "./BugFullCard";
import { FlashAlert } from "./FlashAlert";
import { assignableUsers } from "../utils/roles";

type DetailTab = "comments" | "attachments" | "steps" | "history";

export type BugCardMode = "view" | "fields" | "steps";

type MenuPos = { top: number; left: number };

function blankStep(template?: Partial<Step>): Step {
  return {
    order: 0,
    actionType: template?.actionType ?? "click",
    elementLabel: "",
    selector: "",
    pageUrl: template?.pageUrl ?? "",
    description: "",
    actualResult: "",
    expectedResult: "",
  };
}

function StepEditorMenu({
  onInsertAbove,
  onInsertBelow,
  onDelete,
}: {
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 200;
    const menuH = 148;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({ top: openUp ? rect.top - gap - menuH : rect.bottom + gap, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[80] w-[12.5rem] overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setOpen(false);
                onInsertAbove();
              }}
            >
              Insert steps above
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setOpen(false);
                onInsertBelow();
              }}
            >
              Insert steps below
            </button>
            <hr className="tb-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item-danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Step actions"
        aria-expanded={open}
        className={`tb-kebab-btn tb-bug-steps-editor-kebab ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {menu}
    </>
  );
}

const DESCRIPTION_HEADINGS =
  /^(?:\*\*)?\s*(Summary|Observed behavior|Expected behavior|Impact|Bug observations)\s*(?:\*\*)?\s*:?\s*(.*)$/i;

function bugDisplayId(id: string) {
  const n = parseInt(id.replace(/-/g, "").slice(0, 6), 16);
  return `BUG-${((Number.isNaN(n) ? id.length * 17 : n) % 900) + 100}`;
}

function sectionToneClass(label: string) {
  const key = label.toLowerCase();
  if (key.includes("summary")) return "is-summary";
  if (key.includes("observed")) return "is-observed";
  if (key.includes("expected")) return "is-expected";
  if (key.includes("impact")) return "is-impact";
  if (key.includes("observation")) return "is-observations";
  return "is-default";
}

function parseDescriptionSections(description: string): { label: string; body: string }[] {
  const text = description.trim();
  if (!text) return [];

  const lines = text.split("\n");
  const sections: { label: string; body: string }[] = [];
  let current: { label: string; lines: string[] } | null = null;
  let foundHeading = false;

  for (const line of lines) {
    const match = line.match(DESCRIPTION_HEADINGS);
    const headingOnly =
      match &&
      (match[2] === "" ||
        /^(?:\*\*)?\s*(Summary|Observed behavior|Expected behavior|Impact|Bug observations)\s*(?:\*\*)?\s*:?\s*$/i.test(
          line.trim(),
        ));

    if (match && (headingOnly || match[2] !== "")) {
      foundHeading = true;
      if (current) {
        sections.push({ label: current.label, body: current.lines.join("\n").trim() });
      }
      current = { label: match[1], lines: headingOnly ? [] : [match[2]] };
    } else if (current) {
      current.lines.push(line);
    } else if (!foundHeading) {
      current = { label: "Summary", lines: [line] };
    }
  }

  if (current) {
    sections.push({ label: current.label, body: current.lines.join("\n").trim() });
  }

  if (!foundHeading) {
    return [{ label: "Summary", body: text }];
  }

  return sections.filter((s) => s.body.length > 0);
}

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function statusSelectTone(status: BugStatus) {
  switch (status) {
    case "FIXED":
    case "VERIFIED":
    case "CLOSED":
      return "tone-status-done";
    case "IN_PROGRESS":
    case "OPEN":
      return "tone-status-progress";
    case "REOPENED":
      return "tone-status-reopened";
    default:
      return "tone-status-open";
  }
}

function prioritySelectTone(priority: BugPriority) {
  switch (priority) {
    case "CRITICAL":
      return "tone-priority-critical";
    case "HIGH":
      return "tone-priority-high";
    case "MEDIUM":
      return "tone-priority-medium";
    default:
      return "";
  }
}

function severitySelectTone(severity: BugSeverity) {
  switch (severity) {
    case "BLOCKER":
      return "tone-severity-blocker";
    case "CRITICAL":
      return "tone-severity-critical";
    case "MAJOR":
      return "tone-severity-major";
    default:
      return "";
  }
}

function sectionIcon(label: string) {
  const key = label.toLowerCase();
  if (key.includes("observed")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (key.includes("expected")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 11l3 3L22 4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (key.includes("impact")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function bugTabIcon(tab: DetailTab) {
  switch (tab) {
    case "steps":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "comments":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "attachments":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "history":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
  }
}

const STATUSES: BugStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "FIXED",
  "VERIFIED",
  "CLOSED",
  "REOPENED",
];
const PRIORITIES: BugPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITIES: BugSeverity[] = ["MINOR", "MAJOR", "CRITICAL", "BLOCKER"];

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type FieldsForm = {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  status: BugStatus;
  assigneeId: string;
  cycleId: string;
  moduleId: string;
};

function fieldsFromBug(bug: Bug): FieldsForm {
  return {
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    status: bug.status,
    assigneeId: bug.assigneeId,
    cycleId: bug.cycleId,
    moduleId: bug.moduleId ?? "",
  };
}

/**
 * Full bug detail layout (same as Bug Detail page) — inline on the module page.
 */
function actionTypeLabel(type: Step["actionType"]) {
  switch (type) {
    case "click":
      return "Click";
    case "input":
      return "Input";
    case "navigate":
      return "Navigate";
    case "select":
      return "Select";
    case "check":
      return "Check";
    case "submit":
      return "Submit";
    default:
      return type;
  }
}

function inferActionType(description: string): StepActionType {
  const t = description.toLowerCase();
  if (/\b(navigat\w*|open(?:ed)?|visit(?:ed)?|go(?:es|ing)? to|went to|load(?:ed)?)\b/.test(t)) {
    return "navigate";
  }
  if (/\b(enter(?:ed)?|typ(?:ed|ing)|input|fill(?:ed|ing)?|wrote|write)\b/.test(t)) {
    return "input";
  }
  if (/\b(select(?:ed)?|choose|chose|pick(?:ed)?|dropdown)\b/.test(t)) {
    return "select";
  }
  if (/\b(check(?:ed)?|tick(?:ed)?|toggle(?:d)?)\b/.test(t)) {
    return "check";
  }
  if (/\b(submit(?:ted)?|send(?:t|ing)?)\b/.test(t)) {
    return "submit";
  }
  if (/\b(click(?:ed)?|press(?:ed)?|tap(?:ped)?)\b/.test(t)) {
    return "click";
  }
  return "click";
}

function cleanElementLabel(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[.!,;:]+$/g, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .trim();
}

function extractElementFromAction(description: string): string {
  const text = description.trim();
  if (!text) return "";

  const quoted = text.match(/['“”"]([^'“”"]+)['“”"]/);
  if (quoted?.[1]?.trim()) return cleanElementLabel(quoted[1]);

  const clickOn = text.match(
    /\b(?:click(?:ed)?|press(?:ed)?|tap(?:ped)?)\s+(?:on\s+)?(?:the\s+)?(.+)$/i,
  );
  if (clickOn?.[1]?.trim()) return cleanElementLabel(clickOn[1]);

  const enterIn = text.match(
    /\b(?:enter(?:ed)?|typ(?:ed|ing)|fill(?:ed|ing)?|input|wrote|write)\s+.*?\b(?:in|into|on)\s+(?:the\s+)?(.+)$/i,
  );
  if (enterIn?.[1]?.trim()) return cleanElementLabel(enterIn[1]);

  const selectOn = text.match(
    /\b(?:select(?:ed)?|choose|chose|pick(?:ed)?)\s+(?:the\s+)?(.+?)(?:\s+from\b|$)/i,
  );
  if (selectOn?.[1]?.trim()) return cleanElementLabel(selectOn[1]);

  const checkOn = text.match(
    /\b(?:check(?:ed)?|tick(?:ed)?|toggle(?:d)?|uncheck(?:ed)?)\s+(?:on\s+)?(?:the\s+)?(.+)$/i,
  );
  if (checkOn?.[1]?.trim()) return cleanElementLabel(checkOn[1]);

  const submitOn = text.match(/\b(?:submit(?:ted)?)\s+(?:the\s+)?(.+)$/i);
  if (submitOn?.[1]?.trim()) return cleanElementLabel(submitOn[1]);

  const navigateTo = text.match(
    /\b(?:navigat\w*|open(?:ed)?|visit(?:ed)?|go(?:es|ing)? to|went to)\s+(?:to\s+)?(?:the\s+)?(.+)$/i,
  );
  if (navigateTo?.[1]?.trim()) return cleanElementLabel(navigateTo[1]);

  const stripped = text
    .replace(
      /^(?:i\s+)?(?:then\s+)?(?:click(?:ed)?|press(?:ed)?|tap(?:ped)?|enter(?:ed)?|typ(?:ed|ing)|fill(?:ed|ing)?|navigat\w*|open(?:ed)?|visit(?:ed)?|select(?:ed)?|check(?:ed)?|submit(?:ted)?|go(?:es|ing)? to)\s+(?:on\s+)?(?:to\s+)?(?:the\s+)?/i,
      "",
    )
    .trim();
  if (stripped && stripped.toLowerCase() !== text.toLowerCase()) {
    return cleanElementLabel(stripped);
  }

  return cleanElementLabel(text);
}

/** Keep pageUrl only on the first step of each page (where URL actually changes). */
function keepUrlsOnlyOnPageChanges(steps: Step[]): Step[] {
  let lastUrl = "";
  return steps.map((s) => {
    const url = s.pageUrl.trim();
    if (!url) return { ...s, pageUrl: "" };
    if (url === lastUrl) return { ...s, pageUrl: "" };
    lastUrl = url;
    return { ...s, pageUrl: url };
  });
}

/**
 * Strip duplicate page URLs so URL appears only on page-change steps.
 * Does not copy URL onto same-page steps.
 */
function normalizeStepUrls(steps: Step[]): Step[] {
  return keepUrlsOnlyOnPageChanges(steps);
}

function extractUrlFromAction(description: string): string {
  const match = description.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return "";
  return match[0].replace(/[.,);\]}]+$/g, "");
}

function lookupJoinedUrl(steps: Step[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (steps[i].pageUrl.trim()) return steps[i].pageUrl.trim();
  }
  for (let i = index + 1; i < steps.length; i++) {
    if (steps[i].pageUrl.trim()) return steps[i].pageUrl.trim();
  }
  return "";
}

function serializeStepsForCompare(steps: Step[]) {
  return JSON.stringify(
    steps.map((s, i) => ({
      order: i + 1,
      actionType: s.actionType,
      elementLabel: (s.elementLabel ?? "").trim(),
      selector: (s.selector ?? "").trim(),
      pageUrl: (s.pageUrl ?? "").trim(),
      description: (s.description ?? "").trim(),
      actualResult: (s.actualResult ?? "").trim(),
      expectedResult: (s.expectedResult ?? "").trim(),
      valueEntered: (s.valueEntered ?? "").trim(),
      screenshotId: s.screenshotId ?? "",
    })),
  );
}

function stepsAreEqual(a: Step[], b: Step[]) {
  return serializeStepsForCompare(a) === serializeStepsForCompare(b);
}

function isStepComplete(step: Step) {
  return Boolean(step.description.trim() && (step.actualResult ?? "").trim());
}

export function ModuleBugCard({
  bug,
  assigneeName,
  reporterName,
  cycleName,
  moduleName,
  projectName,
  users,
  cycles,
  modules,
  canEdit,
  canStatus,
  canComment,
  canDelete,
  onSaved,
  compactHero = false,
  requestedMode,
  onModeChange,
}: {
  bug: Bug;
  assigneeName: string;
  reporterName: string;
  cycleName: string;
  moduleName: string;
  projectName: string;
  users: User[];
  cycles: Cycle[];
  modules: Module[];
  canEdit: boolean;
  canStatus: boolean;
  canComment: boolean;
  canDelete: boolean;
  onSaved?: () => void;
  compactHero?: boolean;
  requestedMode?: BugCardMode;
  onModeChange?: (mode: BugCardMode) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setModeState] = useState<BugCardMode>("view");

  function setMode(next: BugCardMode) {
    setModeState(next);
    onModeChange?.(next);
  }

  useEffect(() => {
    if (requestedMode != null && requestedMode !== mode) {
      setModeState(requestedMode);
    }
  }, [requestedMode, mode]);
  const [form, setForm] = useState<FieldsForm>(() => fieldsFromBug(bug));
  const [stepsDraft, setStepsDraft] = useState<Step[]>(() =>
    (bug.steps ?? []).map((s) => ({ ...s })),
  );
  const [stepsBaseline, setStepsBaseline] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("steps");
  const [idCopied, setIdCopied] = useState(false);

  const commentsQuery = useQuery({
    queryKey: queryKeys.bugComments(bug.id),
    queryFn: () => fetchBugComments(bug.id),
  });

  useEffect(() => {
    if (mode === "view") {
      setForm(fieldsFromBug(bug));
      setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    }
  }, [bug, mode]);

  async function invalidateBug() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.bug(bug.id) });
    await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
  }

  const statusMutation = useMutation({
    mutationFn: (status: BugStatus) => updateBugStatus(bug.id, status),
    onSuccess: async () => {
      setMessage("Status updated");
      setError(null);
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const quickUpdateMutation = useMutation({
    mutationFn: (patch: Partial<Pick<Bug, "status" | "priority" | "severity">>) =>
      updateBug(bug.id, {
        title: bug.title,
        description: bug.description,
        priority: patch.priority ?? bug.priority,
        severity: patch.severity ?? bug.severity,
        assigneeId: bug.assigneeId,
        cycleId: bug.cycleId,
        projectId: bug.projectId,
        moduleId: bug.moduleId ?? null,
        status: patch.status ?? bug.status,
      }),
    onSuccess: async () => {
      setMessage("Bug updated");
      setError(null);
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const saveFields = useMutation({
    mutationFn: (payload: FieldsForm) =>
      updateBug(bug.id, {
        title: payload.title.trim(),
        description: payload.description,
        priority: payload.priority,
        severity: payload.severity,
        assigneeId: payload.assigneeId,
        cycleId: payload.cycleId,
        projectId: bug.projectId,
        moduleId: payload.moduleId || null,
        status: payload.status,
      }),
    onSuccess: async () => {
      setMessage("Bug saved");
      setError(null);
      setMode("view");
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const saveSteps = useMutation({
    mutationFn: (steps: Step[]) =>
      updateBug(bug.id, {
        title: bug.title,
        description: bug.description,
        priority: bug.priority,
        severity: bug.severity,
        assigneeId: bug.assigneeId,
        cycleId: bug.cycleId,
        projectId: bug.projectId,
        moduleId: bug.moduleId ?? null,
        status: bug.status,
        steps: steps.map((s, i) => ({
          ...s,
          order: i + 1,
          expectedResult: s.expectedResult?.trim() ? s.expectedResult : undefined,
        })),
      }),
    onSuccess: async () => {
      setMessage("Steps saved");
      setError(null);
      setMode("view");
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => createBugComment(bug.id, body),
    onSuccess: async () => {
      setCommentBody("");
      setCommentError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteBugComment(commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  function startSteps() {
    const initial = renumberSteps(normalizeStepUrls((bug.steps ?? []).map((s) => ({ ...s }))));
    setStepsDraft(initial);
    setStepsBaseline(initial.map((s) => ({ ...s })));
    setMode("steps");
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setMode("view");
    setForm(fieldsFromBug(bug));
    setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    setStepsBaseline([]);
    setError(null);
  }

  function onSaveFields(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.assigneeId || !form.cycleId) {
      setError("Assignee and cycle are required");
      return;
    }
    saveFields.mutate(form);
  }

  function onSaveSteps(e: FormEvent) {
    e.preventDefault();
    const prepared = renumberSteps(
      normalizeStepUrls(
        stepsDraft.map((s) => ({
          ...s,
          actionType: s.description.trim() ? inferActionType(s.description) : s.actionType,
          elementLabel: s.elementLabel.trim() || extractElementFromAction(s.description),
        })),
      ),
    );
    if (
      stepsAreEqual(stepsDraft, stepsBaseline) ||
      !prepared.every(isStepComplete) ||
      prepared.length === 0
    ) {
      return;
    }
    saveSteps.mutate(prepared);
  }

  function updateStep(index: number, patch: Partial<Step>) {
    setStepsDraft((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function renumberSteps(steps: Step[]) {
    return steps.map((s, i) => ({ ...s, order: i + 1 }));
  }

  function insertStepAt(index: number) {
    setStepsDraft((prev) => {
      const next = [...prev];
      next.splice(index, 0, blankStep({}));
      return renumberSteps(normalizeStepUrls(next));
    });
  }

  function deleteStepAt(index: number) {
    setStepsDraft((prev) => renumberSteps(normalizeStepUrls(prev.filter((_, i) => i !== index))));
  }

  function onActionChange(index: number, description: string) {
    const actionType = inferActionType(description);
    const extractedElement = extractElementFromAction(description);
    const extractedUrl = extractUrlFromAction(description);
    setStepsDraft((prev) => {
      const inheritedUrl = lookupJoinedUrl(prev, index);
      const next = prev.map((s, i) => {
        if (i !== index) return s;
        // URL only on page-change: explicit URL in text, or navigate action.
        // Same-page clicks keep pageUrl empty (joined from previous for validation).
        let pageUrl = "";
        if (extractedUrl) {
          pageUrl = extractedUrl;
        } else if (actionType === "navigate") {
          pageUrl = inheritedUrl;
        }
        return {
          ...s,
          description,
          actionType,
          pageUrl,
          elementLabel: extractedElement || s.elementLabel,
        };
      });
      return renumberSteps(normalizeStepUrls(next));
    });
  }

  function onComment(e: FormEvent) {
    e.preventDefault();
    const text = commentBody.trim();
    if (!text) {
      setCommentError("Comment cannot be empty");
      return;
    }
    commentMutation.mutate(text);
  }

  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const comments = commentsQuery.data ?? [];

  if (mode === "fields") {
    return (
      <form onSubmit={onSaveFields} className="space-y-5">
        <header className="tb-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[var(--ink)]">Edit bug</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                Cancel
              </button>
              <button type="submit" className="tb-btn-primary text-xs" disabled={saveFields.isPending}>
                {saveFields.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
          <FlashAlert error={error} message={message} className="" />
          <label className="tb-label">
            Title
            <input
              className="tb-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="tb-label">
            Description
            <textarea
              className="tb-input min-h-[120px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="tb-label">
              Priority
              <select
                className="tb-select"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as BugPriority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Severity
              <select
                className="tb-select"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as BugSeverity })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Status
              <select
                className="tb-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as BugStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="tb-label">
              Assignee
              <select
                className="tb-select"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                required
              >
                {assignableUsers(user, users).map((u) => (
                  <option key={u.id} value={u.id} title={`${u.name} (${u.role})`}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Cycle
              <select
                className="tb-select"
                value={form.cycleId}
                onChange={(e) => setForm({ ...form, cycleId: e.target.value })}
                required
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Module
              <select
                className="tb-select"
                value={form.moduleId}
                onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
              >
                <option value="">None</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
      </form>
    );
  }

  if (mode === "steps") {
    const stepCount = stepsDraft.length;
    const stepsDirty = !stepsAreEqual(stepsDraft, stepsBaseline);
    const stepsValid = stepCount > 0 && stepsDraft.every(isStepComplete);
    const canSaveSteps = stepsDirty && stepsValid && !saveSteps.isPending;
    return (
      <form onSubmit={onSaveSteps} className="tb-bug-steps-editor">
        <header className="tb-bug-steps-editor-hero">
          <div className="tb-bug-steps-editor-hero-glow" aria-hidden />
          <div className="tb-bug-steps-editor-hero-inner">
            <div className="tb-bug-steps-editor-hero-copy">
              <span className="tb-bug-steps-editor-kicker">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3v3M12 21v-3M3 12h3M21 12h-3"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
                </svg>
                Reproduction steps
              </span>
              <h2 className="tb-bug-steps-editor-title">Edit steps</h2>
              <p className="tb-bug-steps-editor-sub">{bug.title}</p>
              <div className="tb-bug-steps-editor-meta">
                <span className="tb-bug-steps-editor-pill">
                  {stepCount} {stepCount === 1 ? "step" : "steps"}
                </span>
                <span className="tb-bug-steps-editor-pill is-soft">{moduleName}</span>
                <span className="tb-bug-steps-editor-pill is-soft">{projectName}</span>
              </div>
            </div>
            <div className="tb-bug-steps-editor-toolbar">
              <button type="button" className="tb-bug-steps-editor-back" onClick={cancelEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M15 18 9 12l6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <div className="tb-bug-steps-editor-actions">
                <button type="button" className="tb-btn-ghost tb-bug-steps-editor-btn" onClick={cancelEdit}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tb-btn-primary tb-bug-steps-editor-btn"
                  disabled={!canSaveSteps}
                  title={
                    !stepsDirty
                      ? "No changes to save"
                      : !stepsValid
                        ? "Action and Actual result are required"
                        : undefined
                  }
                >
                  {saveSteps.isPending ? "Saving…" : "Save steps"}
                </button>
              </div>
              <button
                type="button"
                className="tb-bug-steps-editor-add"
                onClick={() => insertStepAt(stepCount)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Add step
              </button>
            </div>
          </div>
        </header>

        <FlashAlert error={error} message={message} className="tb-bug-steps-editor-alert" />

        {stepCount === 0 ? (
          <div className="tb-bug-steps-editor-empty">
            <span className="tb-bug-steps-editor-empty-icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <p className="tb-bug-steps-editor-empty-title">No steps to edit</p>
            <p className="tb-bug-steps-editor-empty-body">
              This bug has no reproduction steps yet. Use Add step to create the first one.
            </p>
          </div>
        ) : (
          <ol className="tb-bug-steps-editor-list">
            {stepsDraft.map((step, index) => {
              const hasExpected = Boolean(step.expectedResult?.trim());
              const actionMissing = !step.description.trim();
              const actualMissing = !(step.actualResult ?? "").trim();
              const displayElement =
                step.elementLabel.trim() || extractElementFromAction(step.description);
              return (
                <li key={`${step.order}-${index}`} className="tb-bug-steps-editor-card">
                  <div className="tb-bug-steps-editor-card-rail" aria-hidden>
                    <span className="tb-bug-steps-editor-num">{index + 1}</span>
                    {index < stepCount - 1 ? <span className="tb-bug-steps-editor-line" /> : null}
                  </div>
                  <div className="tb-bug-steps-editor-card-body">
                    <div className="tb-bug-steps-editor-card-head">
                      <p className="tb-bug-steps-editor-card-label">Step {index + 1}</p>
                      <span className={`tb-bug-steps-editor-action is-${step.actionType}`}>
                        {actionTypeLabel(step.actionType)}
                      </span>
                      {hasExpected ? (
                        <span className="tb-bug-steps-editor-defect">Defect step</span>
                      ) : null}
                    </div>
                    <div className="tb-bug-steps-editor-context-row">
                      <div className="tb-bug-steps-editor-context">
                        {displayElement ? (
                          <span title={displayElement}>
                            <strong>Element</strong> {displayElement}
                          </span>
                        ) : (
                          <span className="is-empty">
                            <strong>Element</strong> —
                          </span>
                        )}
                        {step.pageUrl.trim() ? (
                          <span title={step.pageUrl}>
                            <strong>URL</strong> {step.pageUrl}
                          </span>
                        ) : null}
                      </div>
                      <StepEditorMenu
                        onInsertAbove={() => insertStepAt(index)}
                        onInsertBelow={() => insertStepAt(index + 1)}
                        onDelete={() => deleteStepAt(index)}
                      />
                    </div>
                    <div className="tb-bug-steps-editor-fields">
                      <label className={`tb-bug-steps-editor-field${actionMissing ? " is-invalid" : ""}`}>
                        <span>
                          Action <em className="tb-bug-steps-req">*</em>
                        </span>
                        <textarea
                          className="tb-input min-h-[72px]"
                          value={step.description}
                          onChange={(e) => onActionChange(index, e.target.value)}
                          placeholder="What did the tester do in this step?"
                        />
                      </label>
                      <label className={`tb-bug-steps-editor-field${actualMissing ? " is-invalid" : ""}`}>
                        <span>
                          Actual result <em className="tb-bug-steps-req">*</em>
                        </span>
                        <textarea
                          className="tb-input min-h-[72px]"
                          value={step.actualResult ?? ""}
                          onChange={(e) => updateStep(index, { actualResult: e.target.value })}
                          placeholder="What actually happened?"
                        />
                      </label>
                      <label className="tb-bug-steps-editor-field is-expected">
                        <span>
                          Expected result
                          <em>Optional — usually only on the defect step</em>
                        </span>
                        <textarea
                          className="tb-input min-h-[72px]"
                          value={step.expectedResult ?? ""}
                          onChange={(e) => updateStep(index, { expectedResult: e.target.value })}
                          placeholder="What should have happened instead?"
                        />
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <footer className="tb-bug-steps-editor-footer">
          <p className="tb-bug-steps-editor-footer-hint">
            Tip: keep actions short and concrete. Put the mismatch in Actual vs Expected on the failing step.
          </p>
          <div className="tb-bug-steps-editor-footer-actions">
            <button type="button" className="tb-btn-ghost text-sm" onClick={cancelEdit}>
              Cancel
            </button>
            <button
              type="submit"
              className="tb-btn-primary text-sm"
              disabled={!canSaveSteps}
              title={
                !stepsDirty
                  ? "No changes to save"
                  : !stepsValid
                    ? "Action and Actual result are required"
                    : undefined
              }
            >
              {saveSteps.isPending ? "Saving…" : "Save steps"}
            </button>
          </div>
        </footer>
      </form>
    );
  }

  const descriptionSections = parseDescriptionSections(bug.description);
  const screenshotCount = bug.screenshots?.length ?? 0;
  const fieldUpdateBusy = quickUpdateMutation.isPending || statusMutation.isPending;
  const displayId = bugDisplayId(bug.id);

  async function onCopyDisplayId() {
    const ok = await copyText(displayId);
    if (ok) {
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1800);
    }
  }

  function onQuickStatusChange(status: BugStatus) {
    if (canEdit) {
      quickUpdateMutation.mutate({ status });
    } else if (canStatus) {
      statusMutation.mutate(status);
    }
  }

  return (
    <article className="tb-bug-detail tb-bug-premium">
      <FlashAlert error={error} message={message} className="" />

      <div className="tb-bug-mock-main">
        <div className="tb-bug-summary-row">
          <header className="tb-bug-hero">
            <span className="tb-bug-hero-glow tb-bug-hero-glow-a" aria-hidden />
            <span className="tb-bug-hero-glow tb-bug-hero-glow-b" aria-hidden />
            <div className="tb-bug-hero-inner">
              {!compactHero ? (
                <div className="tb-bug-badge-row">
                  <span className={`tb-bug-badge ${statusTone(bug.status)}`}>{statusLabel(bug.status)}</span>
                  <span className={`tb-bug-badge ${priorityTone(bug.priority)}`}>{bug.priority}</span>
                  <span className={`tb-bug-badge ${severityTone(bug.severity)}`}>{bug.severity}</span>
                </div>
              ) : null}

              {!compactHero ? <h2 className="tb-bug-title">{bug.title}</h2> : null}

              <div className={`tb-bug-sections${compactHero ? " tb-bug-sections-compact" : ""}`}>
                {descriptionSections.map((section) => (
                  <div
                    key={section.label}
                    className={`tb-bug-section-card ${sectionToneClass(section.label)}`}
                  >
                    <span className="tb-bug-section-icon">{sectionIcon(section.label)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="tb-bug-section-label">{section.label}</p>
                      <p className="tb-bug-section-body">{section.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <aside className="tb-bug-mock-sidebar">
            <div className="tb-bug-side-card">
              <p className="tb-bug-side-heading">Bug details</p>
              <div className={`tb-bug-side-id${idCopied ? " is-copied" : ""}`}>
                <div>
                  <p className="tb-bug-side-id-label">Bug ID</p>
                  <p className="tb-bug-side-id-value">{displayId}</p>
                </div>
                <button
                  type="button"
                  className="tb-bug-side-id-copy"
                  onClick={() => void onCopyDisplayId()}
                  title="Copy bug ID"
                  aria-label="Copy bug ID"
                >
                  {idCopied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                    </svg>
                  )}
                </button>
              </div>

              <dl className="tb-bug-side-fields">
                <div className="tb-bug-side-field">
                  <dt>Status</dt>
                  <dd>
                    {canEdit || canStatus ? (
                      <select
                        id={`bug-status-${bug.id}`}
                        className={`tb-bug-status-select ${statusSelectTone(bug.status)}`}
                        value={bug.status}
                        disabled={fieldUpdateBusy}
                        onChange={(e) => onQuickStatusChange(e.target.value as BugStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`tb-bug-status-readonly ${statusTone(bug.status)}`}>
                        {statusLabel(bug.status)}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Priority</dt>
                  <dd>
                    {canEdit ? (
                      <select
                        id={`bug-priority-${bug.id}`}
                        className={`tb-bug-status-select ${prioritySelectTone(bug.priority)}`}
                        value={bug.priority}
                        disabled={fieldUpdateBusy}
                        onChange={(e) =>
                          quickUpdateMutation.mutate({ priority: e.target.value as BugPriority })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`tb-bug-status-readonly ${priorityTone(bug.priority)}`}>
                        {bug.priority}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Severity</dt>
                  <dd>
                    {canEdit ? (
                      <select
                        id={`bug-severity-${bug.id}`}
                        className={`tb-bug-status-select ${severitySelectTone(bug.severity)}`}
                        value={bug.severity}
                        disabled={fieldUpdateBusy}
                        onChange={(e) =>
                          quickUpdateMutation.mutate({ severity: e.target.value as BugSeverity })
                        }
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`tb-bug-status-readonly ${severityTone(bug.severity)}`}>
                        {bug.severity}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Project</dt>
                  <dd>{projectName}</dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Module</dt>
                  <dd>{moduleName}</dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Cycle</dt>
                  <dd>{cycleName}</dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Reported on</dt>
                  <dd>{formatWhen(bug.createdAt)}</dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Assignee</dt>
                  <dd className="tb-bug-side-person">
                    <span className="tb-bug-avatar">{personInitials(assigneeName)}</span>
                    {assigneeName}
                  </dd>
                </div>
                <div className="tb-bug-side-field">
                  <dt>Reporter</dt>
                  <dd className="tb-bug-side-person">
                    <span className="tb-bug-avatar">{personInitials(reporterName)}</span>
                    {reporterName}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>

        <section className="tb-bug-panel-card">
            <div className="tb-bug-tabs" role="tablist" aria-label="Bug detail sections">
            {(
              [
                ["steps", "Steps"],
                ["attachments", `Attachments (${screenshotCount})`],
                ["history", "History"],
                ["comments", `Comments (${comments.length})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`tb-bug-tab${activeTab === tab ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <span className="tb-bug-tab-icon" aria-hidden>
                  {bugTabIcon(tab)}
                </span>
                {label}
              </button>
            ))}
          </div>

          <div className="tb-bug-tab-panel">
            {activeTab === "comments" && (
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Testers can edit bug fields and comment. Developers can update status and comment.
                </p>
                {commentError && <p className="tb-alert-error mt-3">{commentError}</p>}
                {canComment ? (
                  <form className="mt-4" onSubmit={onComment}>
                    <label className="tb-label">
                      Add comment
                      <textarea
                        className="tb-input min-h-[80px]"
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Write a comment…"
                      />
                    </label>
                    <button
                      type="submit"
                      className="tb-btn-primary mt-3 text-sm"
                      disabled={commentMutation.isPending || !commentBody.trim()}
                    >
                      {commentMutation.isPending ? "Posting…" : "Post comment"}
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-xs text-[var(--muted)]">You can read comments only.</p>
                )}
                <div className="mt-4 space-y-3">
                  {comments.map((c) => {
                    const authorLabel = c.authorName || nameOf(c.authorId);
                    return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--input-bg)] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="tb-bug-comment-author">
                          <span className="tb-bug-avatar" aria-hidden>
                            {personInitials(authorLabel)}
                          </span>
                          <p className="text-sm font-semibold text-[var(--ink)]">{authorLabel}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--muted)]">{formatWhen(c.createdAt)}</span>
                          {(user?.id === c.authorId || canDelete) && (
                            <button
                              type="button"
                              className="tb-bug-comment-delete"
                              disabled={deleteCommentMutation.isPending}
                              onClick={() => deleteCommentMutation.mutate(c.id)}
                              title="Delete comment"
                              aria-label="Delete comment"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path
                                  d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V6"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M10 11v6M14 11v6"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{c.body}</p>
                    </div>
                    );
                  })}
                  {!commentsQuery.isLoading && comments.length === 0 && (
                    <p className="text-sm text-[var(--muted)]">No comments yet.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "attachments" && (
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Captured and highlighted from the TestBuddy extension.
                </p>
                <BugScreenshots screenshots={bug.screenshots} />
              </div>
            )}

            {activeTab === "steps" && (
              <div>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="text-xs text-[var(--muted)]">
                    Step + Actual Result on every row. Expected Result only on the defect step.
                  </p>
                  {canEdit && (
                    <button type="button" onClick={startSteps} className="tb-btn-primary text-xs">
                      Edit steps
                    </button>
                  )}
                </div>
                <BugStepsTable bug={bug} />
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)]">
                  Status history will appear here as the bug progresses.
                </p>
                <div className="tb-bug-activity">
                  <div className="tb-bug-activity-item">
                    <span className="tb-bug-activity-dot" aria-hidden />
                    <div>
                      <p className="tb-bug-activity-text">Created</p>
                      <p className="tb-bug-activity-time">{formatWhen(bug.createdAt)}</p>
                    </div>
                  </div>
                  {bug.updatedAt && bug.updatedAt !== bug.createdAt && (
                    <div className="tb-bug-activity-item">
                      <span className="tb-bug-activity-dot" aria-hidden />
                      <div>
                        <p className="tb-bug-activity-text">Last updated</p>
                        <p className="tb-bug-activity-time">{formatWhen(bug.updatedAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </section>
      </div>
    </article>
  );
}
