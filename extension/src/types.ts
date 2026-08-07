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
  active?: boolean;
  mustChangePassword?: boolean;
}

export interface Project {
  id: string;
  name: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  startDate?: string;
  endDate?: string;
}

/** @deprecated Use Sprint */
export type Cycle = Sprint;

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  active: boolean;
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
  sprintId: string;
  projectId: string;
  moduleId?: string | null;
  environmentId?: string | null;
  environmentName?: string | null;
  environmentSnapshot?: string | null;
  status: BugStatus;
  steps: Step[];
  screenshots?: {
    id: string;
    overview: string;
    pageUrl: string;
    url: string;
    createdAt: string;
  }[];
  externalRefs?: {
    jiraIssueKey?: string;
    adoWorkItemId?: string;
    adoWorkItemUrl?: string | null;
  };
  adoLastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugCreateRequest {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  assigneeId: string;
  sprintId: string;
  projectId: string;
  moduleId?: string;
  environmentId?: string;
  environmentSnapshot?: string;
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
