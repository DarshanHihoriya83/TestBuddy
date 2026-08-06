import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:8080";
const WIDTHS = [1024, 1280, 1440];

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failures = [];

const res = await page.request.post(`${API}/api/auth/login`, {
  data: { email: "carol@testbuddy.local", password: "password" },
});
const body = await res.json();
await page.goto(`${BASE}/login`);
await page.evaluate(
  ({ token, user }) => {
    localStorage.setItem("testbuddy_token", token);
    localStorage.setItem("testbuddy_user", JSON.stringify(user));
  },
  { token: body.token, user: body.user },
);

/** Report table overflow, per-column widths and any clipped cell text. */
async function measure(label) {
  const data = await page.evaluate(() => {
    const table = document.querySelector("table.tb-table");
    if (!table) return null;
    const scroller = table.closest(".overflow-auto");
    const headers = [...table.querySelectorAll("thead th")].map((th) => ({
      label: (th.textContent || "").trim().slice(0, 14) || "(check)",
      width: Math.round(th.getBoundingClientRect().width),
    }));
    const clipped = [];
    for (const cell of table.querySelectorAll("tbody td")) {
      const targets = [cell, ...cell.querySelectorAll("span, a, p")];
      for (const el of targets) {
        if (el.scrollWidth - el.clientWidth > 1 && (el.textContent || "").trim()) {
          clipped.push((el.textContent || "").trim().slice(0, 24));
          break;
        }
      }
    }
    return {
      rows: table.querySelectorAll("tbody tr").length,
      overflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      headers,
      clipped: [...new Set(clipped)],
    };
  });
  if (!data || !data.rows) {
    console.log(`${label}: skipped (no rows)`);
    return;
  }
  console.log(
    `${label}: overflow=${data.overflow}px cols=${data.headers
      .map((h) => `${h.label}:${h.width}`)
      .join(" ")}`,
  );
  if (data.overflow > 1) failures.push(`${label}: table overflows by ${data.overflow}px`);
  if (data.clipped.length) failures.push(`${label}: clipped text ${data.clipped.join(" | ")}`);
}

async function atWidths(label, shotPrefix) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(500);
    await measure(`${label} @${width}`);
    if (width === 1024) await page.screenshot({ path: `.ui-test-artifacts/${shotPrefix}-1024.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
}

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await atWidths("Projects list", "cols-projects");

await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await atWidths("Modules list", "cols-modules");

await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await atWidths("Module bugs list", "cols-bugs");

await page.locator("button", { hasText: /Test Cases/i }).first().click();
await page.waitForTimeout(900);
await atWidths("Test cases list", "cols-testcases");

console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);
