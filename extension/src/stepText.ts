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

/**
 * Bug reproduction steps describe what actually happened (past tense).
 * Do NOT put expected-result language here — that belongs to test cases.
 */
export function buildActualStepDescription(args: {
  actionType: StepActionType;
  elementLabel: string;
  valueEntered?: string;
  elementKind?: string;
}): string {
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

/** @deprecated Use buildActualStepDescription for bug steps. Kept for test-case mode later. */
export function buildStepDescription(args: {
  actionType: StepActionType;
  elementLabel: string;
  valueEntered?: string;
  elementKind?: string;
}): string {
  return buildActualStepDescription(args);
}

/**
 * Expected results are for test cases only — never attach to bug reproduction steps.
 * Kept for Phase 4 Test Case mode.
 */
export function buildExpectedResult(args: {
  actionType: StepActionType;
  elementLabel: string;
  valueEntered?: string;
  elementKind?: string;
}): string {
  const label = args.elementLabel || "element";
  const value = args.valueEntered?.trim();
  const kind = args.elementKind || "";

  switch (args.actionType) {
    case "click":
      if (kind === "link") {
        return `The hyperlink '${label}' should open the target page or section`;
      }
      if (kind === "button") {
        return `The '${label}' button action should complete successfully`;
      }
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
      if (value === "unchecked") {
        return `The '${label}' checkbox should be unchecked`;
      }
      return `The '${label}' checkbox should be checked`;
    case "submit":
      return `The '${label}' form should submit and the expected result page or message should appear`;
    case "navigate":
      return `The page '${label}' should load successfully`;
    default:
      return `The action on '${label}' should complete as expected`;
  }
}
