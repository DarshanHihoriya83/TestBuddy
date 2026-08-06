import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
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

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const projectLink = page.locator(".tb-table a[href^='/projects/']").first();
if (await projectLink.count()) await projectLink.click({ force: true });
else await page.locator(".tb-project-card a[href^='/projects/']").first().click({ force: true });
await page.waitForURL(/\/projects\/[^/]+$/);
await page.waitForTimeout(800);
await page.locator('a[href*="/modules/"]').first().click();
await page.waitForURL(/\/modules\//);
await page.waitForTimeout(900);
await page.getByRole("tab", { name: /Test Cases/i }).click();
await page.waitForTimeout(800);

const metrics = await page.evaluate(() => {
  const scroller = document.querySelector(".tb-mod-stage .tb-table")?.closest("div");
  const table = document.querySelector(".tb-mod-stage .tb-table");
  const rows = Array.from(document.querySelectorAll(".tb-mod-stage .tb-table tbody tr"));
  const vh = window.innerHeight;
  const fullyVisibleRows = rows.filter((r) => {
    const b = r.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= vh && b.height > 0;
  }).length;
  return {
    tableWidth: table?.getBoundingClientRect().width ?? 0,
    scrollWidth: scroller?.scrollWidth ?? 0,
    clientWidth: scroller?.clientWidth ?? 0,
    horizontalOverflow: (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
    rowCount: rows.length,
    fullyVisibleRows,
  };
});
console.log(JSON.stringify(metrics, null, 2));
await page.screenshot({ path: ".ui-test-artifacts/module-1024-listview.png" });
await browser.close();

if (metrics.horizontalOverflow > 2) {
  throw new Error(`horizontal scroll present: ${metrics.horizontalOverflow}px`);
}
if (metrics.rowCount > 0 && metrics.fullyVisibleRows < Math.min(3, metrics.rowCount)) {
  throw new Error(`only ${metrics.fullyVisibleRows}/${metrics.rowCount} rows fully visible`);
}
console.log("MODULE_1024_OK");
