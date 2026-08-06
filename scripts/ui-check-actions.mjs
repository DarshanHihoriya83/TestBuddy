import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
const projAction = await page.locator("th.tb-table-actions-col").first().boundingBox();
const projKebab = await page.locator(".tb-table .tb-kebab-btn").first().boundingBox();
console.log("projects actions th", projAction);
console.log("projects kebab", projKebab);
await page.screenshot({ path: ".ui-test-artifacts/fix-projects-actions.png", fullPage: true });

const projectLink = page.locator(".tb-table a[href^='/projects/']").first();
if (await projectLink.count()) {
  await projectLink.click();
} else {
  await page.locator(".tb-project-card a[href^='/projects/']").first().click();
}
await page.waitForURL(/\/projects\/[^/]+$/);
await page.waitForTimeout(800);
const modAction = await page.locator("th.tb-table-actions-col").first().boundingBox();
console.log("modules actions th", modAction);
await page.screenshot({ path: ".ui-test-artifacts/fix-modules-actions.png", fullPage: true });

await page.locator('a[href*="/modules/"]').first().click();
await page.waitForURL(/\/modules\//);
await page.waitForTimeout(800);
await page.getByRole("tab", { name: /Test Cases/i }).click();
await page.waitForTimeout(600);

const tcHeaderText = await page.locator("thead").innerText();
const tcAction = await page.locator("th.tb-table-actions-col").first().boundingBox();
const tcKebab = await page.locator(".tb-table .tb-kebab-btn").first().boundingBox();
console.log("tc thead", tcHeaderText.replace(/\s+/g, " | "));
console.log("tc actions th", tcAction);
console.log("tc kebab", tcKebab);
const visible = !!(tcKebab && tcKebab.x + tcKebab.width <= 1440 && tcKebab.width > 0);
console.log("tc kebab visible in viewport", visible);
await page.screenshot({ path: ".ui-test-artifacts/fix-tc-actions.png", fullPage: true });

await browser.close();

if (!projAction || projAction.width < 60 || projAction.width > 120) {
  throw new Error(`projects actions width bad: ${projAction?.width}`);
}
if (!modAction || modAction.width < 60 || modAction.width > 120) {
  throw new Error(`modules actions width bad: ${modAction?.width}`);
}
if (!tcAction || tcAction.width < 60 || tcAction.width > 120) {
  throw new Error(`tc actions width bad: ${tcAction?.width}`);
}
if (!/ACTIONS/i.test(tcHeaderText.replace(/\s+/g, ""))) {
  throw new Error(`ACTIONS header clipped/missing: ${tcHeaderText}`);
}
if (!visible) throw new Error("tc kebab not visible");
// Ensure kebab not flush-clipped past viewport
if (tcKebab.x + tcKebab.width > 1435) {
  throw new Error(`tc kebab too close to edge: right=${tcKebab.x + tcKebab.width}`);
}
console.log("ACTIONS_COL_OK");
