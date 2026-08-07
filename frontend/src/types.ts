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

export type TestCaseType = "POSITIVE" | "NEGATIVE";
export type TestCasePriority = "LOW" | "MEDIUM" | "HIGH";
export type TestCaseStatus = "AI_DRAFT" | "VERIFIED" | "REJECTED" | "UPLOADED";
export type TestCaseExecutionStatus =
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "NOT_EXECUTED";

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
  /** True until the user replaces their auto-generated temporary password. */
  mustChangePassword?: boolean;
}

/** Admin create/reset response — temporaryPassword is shown once. */
export type UserWithTemporaryPassword = User & { temporaryPassword: string };

export interface Project {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  jiraProjectKey?: string;
  adoOrgUrl?: string;
  adoProject?: string;
  adoTeam?: string | null;
  adoPatConfigured?: boolean;
  createdBy?: string | null;
  createdAt?: string;
}

export interface ProjectCreationQuota {
  role: string;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface Organization {
  id: string;
  name: string;
  createdAt?: string;
  /** Max projects allowed in this org (Managers enforced; SuperAdmin may exceed). */
  maxProjects: number;
  projectCount?: number;
  memberCount?: number;
  projects?: Project[];
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt?: string;
}

export interface BugComment {
  id: string;
  bugId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  createdAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  source?: "MANUAL" | "ADO" | string;
  adoIterationId?: string | null;
  adoIterationPath?: string | null;
  lastSyncedAt?: string | null;
}

/** @deprecated Use Sprint — kept temporarily for gradual migration. */
export type Cycle = Sprint;

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  active: boolean;
  createdAt?: string;
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
  sprintId: string;
  projectId: string;
  moduleId?: string | null;
  environmentId?: string | null;
  environmentName?: string | null;
  environmentSnapshot?: string | null;
  status: BugStatus;
  steps: Step[];
  screenshots?: BugScreenshot[];
  externalRefs?: {
    jiraIssueKey?: string;
    adoWorkItemId?: string;
    adoWorkItemUrl?: string | null;
  };
  adoLastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  projectId?: string;
  priority?: BugPriority | "";
  severity?: BugSeverity | "";
  assigneeId?: string;
  sprintId?: string;
  status?: BugStatus | "";
  moduleId?: string;
  environmentId?: string;
}

export interface TestCaseStep {
  order?: number;
  action: string;
  expectedResult?: string;
}

export interface TestCase {
  id: string;
  title: string;
  flowDescription: string;
  type: TestCaseType;
  preconditions?: string | null;
  steps: TestCaseStep[];
  priority: TestCasePriority;
  status: TestCaseStatus;
  executionStatus: TestCaseExecutionStatus;
  generatedByAi: boolean;
  projectId: string;
  moduleId?: string | null;
  sprintId: string;
  assigneeId?: string | null;
  linkedBugId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseFilters {
  projectId?: string;
  moduleId?: string;
  status?: TestCaseStatus | "";
  type?: TestCaseType | "";
  priority?: TestCasePriority | "";
  assigneeId?: string;
  executionStatus?: TestCaseExecutionStatus | "";
}
