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
  /** Steps column — action performed */
  description: string;
  /** Actual Result — outcome of this step */
  actualResult?: string;
  /** Expected Result — only on the defect step; blank otherwise */
  expectedResult?: string;
  screenshotId?: string;
}

export interface BugScreenshot {
  id: string;
  overview: string;
  pageUrl: string;
  url: string;
  contentType?: string;
  annotations?: { type: string; x: number; y: number; w: number; h: number }[];
  createdAt: string;
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
  screenshots?: BugScreenshot[];
  externalRefs?: { jiraIssueKey?: string; adoWorkItemId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  projectId?: string;
  priority?: BugPriority | "";
  severity?: BugSeverity | "";
  assigneeId?: string;
  cycleId?: string;
  status?: BugStatus | "";
}
