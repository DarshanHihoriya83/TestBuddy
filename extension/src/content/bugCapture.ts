import type { Step } from "../types";
import { boldData, buildExpectedResult } from "../stepText";

export interface RectAnnotation {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CapturedScreenshot {
  id: string;
  dataUrl: string;
  overview: string;
  pageUrl: string;
  createdAt: string;
  annotations: RectAnnotation[];
}

/** Turn a short bug overview into a clear repro observation step. */
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
    description: overview
      ? `Inspected the highlighted region and observed the defect: ${boldData(overview)}`
      : `Inspected the highlighted region and marked a defect on the screenshot`,
    expectedResult: overview
      ? `The highlighted area should behave correctly — issue ${boldData(overview)} should not occur`
      : buildExpectedResult({
          actionType: "click",
          elementLabel: "highlighted defect",
          elementKind: "clickable",
        }),
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
