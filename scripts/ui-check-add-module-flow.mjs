import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";
const NAME = `Hdr Check ${Date.now()}`;

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
await page.waitForTimeout(700);
const link = page.locator(".tb-table a[href^='/projects/']").first();
if (await link.count()) await link.click({ force: true });
else await page.locator(".tb-project-card a[href^='/projects/']").first().click({ force: true });
await page.waitForURL(/\/projects\/[^/]+$/);
await page.waitForTimeout(800);

await page.getByRole("button", { name: /Add Module/i }).first().click();
await page.waitForTimeout(400);
await page.locator('[role="dialog"] input').first().fill(NAME);
await page.locator('[role="dialog"]').getByRole("button", { name: /^Add module$/i }).click();
await page.waitForTimeout(1500);

const dialogGone = (await page.locator('[role="dialog"]').count()) === 0;
const created = await page.getByText(NAME, { exact: true }).count();
const chip = await page.locator(".tb-mod-command-meta").first().innerText();
console.log({ dialogGone, created, chip: chip.replace(/\s+/g, " ") });
await page.screenshot({ path: ".ui-test-artifacts/hdr-module-created.png" });

// Clean up through the API so a mis-targeted UI click can never delete real data.
const modules = await page.request.get(`${API}/api/projects/${page.url().split("/").pop()}/modules`, {
  headers: { authorization: `Bearer ${body.token}` },
});
const createdModule = (await modules.json()).find((m) => m.name === NAME);
if (createdModule) {
  await page.request.delete(`${API}/api/modules/${createdModule.id}`, {
    headers: { authorization: `Bearer ${body.token}` },
  });
  console.log({ cleanedUp: true });
}

await browser.close();
if (!dialogGone) throw new Error("create dialog stayed open after submit");
if (!created) throw new Error("created module not listed");
console.log("ADD_MODULE_FLOW_OK");
