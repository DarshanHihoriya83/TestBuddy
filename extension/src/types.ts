export type UserRole = "SUPERADMIN" | "TESTER" | "DEVELOPER" | "MANAGER";
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
  /** Steps column — action the tester performed */
  description: string;
  /** Actual Result column — outcome of this step (filled for every step) */
  actualResult?: string;
  /**
   * Expected Result column — ONLY on the step where the bug is found
   * (e.g. screenshot defect). Leave blank on all other steps.
   */
  expectedResult?: string;
  screenshotId?: string;
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
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
  moduleId?: string | null;
  status: BugStatus;
  steps: Step[];
  screenshots?: {
    id: string;
    overview: string;
    pageUrl: string;
    url: string;
    createdAt: string;
  }[];
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
  moduleId?: string;
  status?: BugStatus;
  steps?: Step[];
  screenshots?: {
    id: string;
    dataUrl: string;
    overview: string;
    pageUrl: string;
    createdAt?: string;
    annotations?: Array<Record<string, unknown> & { type: string }>;
  }[];
}
