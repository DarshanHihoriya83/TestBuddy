export type UserRole = "ADMIN" | "TESTER" | "DEVELOPER" | "MANAGER";
export type BugPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BugSeverity = "MINOR" | "MAJOR" | "CRITICAL" | "BLOCKER";
export type BugStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "FIXED"
  | "VERIFIED"
  | "CLOSED"
  | "REOPENED";
export type StepActionType =
  | "click"
  | "input"
  | "navigate"
  | "select"
  | "check"
  | "submit";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Project {
  id: string;
  name: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
}

export interface Cycle {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  startDate?: string;
  endDate?: string;
}

export interface Step {
  order: number;
  actionType: StepActionType;
  elementLabel: string;
  selector: string;
  valueEntered?: string;
  pageUrl: string;
  /** What actually happened (bug repro). Past-tense action text. */
  description: string;
  /** Test-case only — do not set on bug steps. */
  expectedResult?: string;
  screenshotId?: string;
}

export interface Bug {
  id: string;
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  assigneeId: string;
  reporterId: string;
  cycleId: string;
  projectId: string;
  status: BugStatus;
  steps: Step[];
  externalRefs?: { jiraIssueKey?: string; adoWorkItemId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface BugCreateRequest {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  assigneeId: string;
  cycleId: string;
  projectId: string;
  status?: BugStatus;
  steps?: Step[];
}
