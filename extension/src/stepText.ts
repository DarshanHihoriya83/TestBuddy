import type { StepActionType } from "./types";

/** Wrap captured data so UIs can render it bold via formatBoldHtml / formatBoldNodes. */
export function boldData(value: string): string {
  return `**${value.replace(/\*\*/g, "")}**`;
}

export function formatBoldHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type StepTextArgs = {
  actionType: StepActionType;
  elementLabel: string;
  valueEntered?: string;
  elementKind?: string;
};

/**
 * Steps column — what the tester did (action).
 * Matches spreadsheet "Steps" numbered list.
 */
export function buildStepAction(args: StepTextArgs): string {
  const label = args.elementLabel || "element";
  const value = args.valueEntered?.trim();
  const kind = args.elementKind || "";

  switch (args.actionType) {
    case "click":
      if (kind === "link") return `Clicked the hyperlink ${boldData(label)}`;
      if (kind === "button") return `Clicked the ${boldData(label)} button`;
      return `Clicked ${boldData(label)}`;
    case "input":
      if (value) return `Entered ${boldData(value)} in the ${boldData(label)} field`;
      return `Typed in the ${boldData(label)} field`;
    case "select":
      if (value) return `Selected ${boldData(value)} from the ${boldData(label)} dropdown`;
      return `Changed the ${boldData(label)} dropdown`;
    case "check":
      if (kind === "radio") {
        return value
          ? `Selected radio option ${boldData(value)} for ${boldData(label)}`
          : `Selected a radio option for ${boldData(label)}`;
      }
      if (value === "checked") return `Checked the ${boldData(label)} checkbox`;
      if (value === "unchecked") return `Unchecked the ${boldData(label)} checkbox`;
      return `Toggled the ${boldData(label)} checkbox`;
    case "submit":
      return `Submitted the ${boldData(label)} form`;
    case "navigate":
      return `Navigated to ${boldData(label)}`;
    default:
      return `Interacted with ${boldData(label)}`;
  }
}

/**
 * Actual Result column — outcome of that step (what happened).
 * Filled for every step, same numbering as Steps.
 */
export function buildActualResult(args: StepTextArgs): string {
  const label = args.elementLabel || "element";
  const value = args.valueEntered?.trim();
  const kind = args.elementKind || "";

  switch (args.actionType) {
    case "click":
      if (kind === "link") return `Hyperlink ${boldData(label)} was activated and navigation/action started`;
      if (kind === "button") return `${boldData(label)} button click was registered on the page`;
      return `${boldData(label)} was clicked successfully`;
    case "input":
      return value
        ? `${boldData(label)} field accepted the value ${boldData(value)}`
        : `${boldData(label)} field accepted the typed input`;
    case "select":
      return value
        ? `${boldData(label)} dropdown updated to ${boldData(value)}`
        : `${boldData(label)} dropdown selection was updated`;
    case "check":
      if (kind === "radio") {
        return value
          ? `Radio option ${boldData(value)} for ${boldData(label)} became selected`
          : `Radio selection for ${boldData(label)} was updated`;
      }
      if (value === "unchecked") return `${boldData(label)} checkbox became unchecked`;
      return `${boldData(label)} checkbox became checked`;
    case "submit":
      return `${boldData(label)} form submit was triggered`;
    case "navigate":
      return `Page ${boldData(label)} loaded in the browser`;
    default:
      return `Interaction with ${boldData(label)} completed on the page`;
  }
}

/**
 * Expected Result — ONLY for the step where the bug is observed (screenshot / defect step).
 * Other steps must leave expectedResult blank.
 */
export function buildExpectedForDefect(overview: string): string {
  const text = overview.trim().replace(/\s+/g, " ");
  if (!text) {
    return "The highlighted area should behave correctly according to the requirements";
  }
  const lower = text.toLowerCase();

  if (/not\s+(receive|received|coming|arrive)|missing|nahi\s+aa/.test(lower)) {
    return `The system should deliver / show the expected result correctly — issue "${text}" should not occur`;
  }
  if (/accept|allow|invalid|non[- ]?digit|character|letter|validation/.test(lower)) {
    return `The field should validate input correctly and prevent the reported issue: ${text}`;
  }
  if (/error|fail|broken|not\s+work|unable|cannot/.test(lower)) {
    return `The action should complete successfully without the reported failure: ${text}`;
  }
  if (/display|show|visible|ui|layout|align/.test(lower)) {
    return `The UI should display the correct content/layout — "${text}" should not appear`;
  }
  if (/slow|lag|performance/.test(lower)) {
    return `The page/feature should respond within an acceptable time without the reported delay`;
  }

  return `The system should behave correctly and the following defect should not occur: ${text}`;
}

/** @deprecated Use buildStepAction */
export function buildActualStepDescription(args: StepTextArgs): string {
  return buildStepAction(args);
}

/** @deprecated Use buildStepAction */
export function buildStepDescription(args: StepTextArgs): string {
  return buildStepAction(args);
}

/** Generic expected (test-case mode). Do not use for normal bug steps. */
export function buildExpectedResult(args: StepTextArgs): string {
  const label = args.elementLabel || "element";
  const value = args.valueEntered?.trim();
  const kind = args.elementKind || "";

  switch (args.actionType) {
    case "click":
      if (kind === "link") return `The hyperlink '${label}' should open the target page or section`;
      if (kind === "button") return `The '${label}' button action should complete successfully`;
      return `The '${label}' control should respond to the click`;
    case "input":
      return value
        ? `The '${label}' field should contain ${boldData(value)}`
        : `The '${label}' field should accept the typed text`;
    case "select":
      return value
        ? `The '${label}' dropdown should show ${boldData(value)} as selected`
        : `The '${label}' dropdown selection should be updated`;
    case "check":
      if (kind === "radio") {
        return value
          ? `The radio option ${boldData(value)} for '${label}' should be selected`
          : `The selected radio option for '${label}' should be active`;
      }
      if (value === "unchecked") return `The '${label}' checkbox should be unchecked`;
      return `The '${label}' checkbox should be checked`;
    case "submit":
      return `The '${label}' form should submit and the expected result page or message should appear`;
    case "navigate":
      return `The page '${label}' should load successfully`;
    default:
      return `The action on '${label}' should complete as expected`;
  }
}
