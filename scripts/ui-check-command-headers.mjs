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

const failures = [];
async function expectHeader(name) {
  const header = page.locator(".tb-mod-command").first();
  const count = await header.count();
  if (!count) {
    failures.push(`${name}: no command header`);
    return;
  }
  const text = (await header.innerText()).replace(/\s+/g, " ").trim();
  console.log(`${name}: ${text}`);
}

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await expectHeader("projects");
await page.screenshot({ path: ".ui-test-artifacts/hdr-projects.png" });

const link = page.locator(".tb-table a[href^='/projects/']").first();
if (await link.count()) await link.click({ force: true });
else await page.locator(".tb-project-card a[href^='/projects/']").first().click({ force: true });
await page.waitForURL(/\/projects\/[^/]+$/);
await page.waitForTimeout(900);
await expectHeader("project detail");
await page.screenshot({ path: ".ui-test-artifacts/hdr-project-detail.png" });

// Add Module button in the header must open the create dialog
const addModule = page.getByRole("button", { name: /Add Module/i }).first();
if (await addModule.count()) {
  await addModule.click();
  await page.waitForTimeout(500);
  const dialog = page.locator('[role="dialog"]');
  if (!(await dialog.count())) failures.push("project detail: Add Module did not open dialog");
  await page.screenshot({ path: ".ui-test-artifacts/hdr-add-module.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const cancel = page.getByRole("button", { name: /^Cancel$/i }).first();
  if (await cancel.count()) await cancel.click();
  await page.waitForTimeout(400);
} else {
  failures.push("project detail: Add Module button missing");
}

await page.locator('a[href*="/modules/"]').first().click({ force: true });
await page.waitForURL(/\/modules\//);
await page.waitForTimeout(900);
await expectHeader("module detail");
await page.screenshot({ path: ".ui-test-artifacts/hdr-module.png" });

await browser.close();
if (failures.length) throw new Error(failures.join("; "));
console.log("COMMAND_HEADERS_OK");
