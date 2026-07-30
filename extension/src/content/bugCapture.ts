import type { Step } from "../types";
import { boldData } from "../stepText";

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

/** Turn a short bug overview into an actual observation step (not expected result). */
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
      ? `Observed the defect on the highlighted area: ${boldData(overview)}`
      : `Marked a defect on the highlighted screenshot region`,
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
