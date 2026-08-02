import type { Step } from "../types";
import { boldData, buildExpectedForDefect } from "../stepText";

export type Annotation =
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      width: number;
    }
  | {
      type: "highlight";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      width: number;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    }
  | {
      type: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    }
  | {
      type: "pen";
      points: { x: number; y: number }[];
      color: string;
      width: number;
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      size: number;
    };

/** @deprecated use Annotation — kept for older callsites */
export type RectAnnotation = Extract<Annotation, { type: "rect" }>;

export interface CapturedScreenshot {
  id: string;
  dataUrl: string;
  overview: string;
  pageUrl: string;
  createdAt: string;
  annotations: Annotation[];
}

/**
 * Defect step from screenshot + overview.
 * Spreadsheet style:
 *  - Step: action
 *  - Actual Result: what was observed (bug)
 *  - Expected Result: only on this step (what should have happened)
 */
export function buildObservationFromOverview(args: {
  overview: string;
  pageUrl: string;
  screenshotId: string;
}): Omit<Step, "order"> {
  const overview = args.overview.trim().replace(/\s+/g, " ");
  const short = overview.length > 80 ? `${overview.slice(0, 77)}…` : overview;

  return {
    actionType: "click",
    elementLabel: short || "highlighted defect",
    selector: "[data-testbuddy-highlight]",
    pageUrl: args.pageUrl,
    screenshotId: args.screenshotId,
    description: `Inspected the highlighted region on the page and reviewed the defect`,
    actualResult: overview
      ? `Observed defect: ${boldData(overview)}`
      : `Defect was marked on the highlighted screenshot region`,
    expectedResult: buildExpectedForDefect(overview),
  };
}

export function composeBugDescription(
  baseDescription: string,
  screenshots: CapturedScreenshot[],
): string {
  const base = baseDescription.trim();
  if (!screenshots.length) return base;
  const notes = screenshots
    .map((s, i) => `${i + 1}. ${s.overview.trim()}`)
    .filter((line) => line.length > 3)
    .join("\n");
  if (!notes) return base;
  return base
    ? `${base}\n\nBug observations from screenshots:\n${notes}`
    : `Bug observations from screenshots:\n${notes}`;
}
