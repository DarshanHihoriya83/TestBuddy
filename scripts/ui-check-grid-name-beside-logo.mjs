import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:8080";

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
await page.getByRole("button", { name: /Grid view/i }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".ui-test-artifacts/grid-name-projects.png" });

await page.getByRole("button", { name: /List view/i }).first().click();
await page.waitForTimeout(400);
await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
await page.getByRole("button", { name: /Grid view/i }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".ui-test-artifacts/grid-name-modules.png" });

await page.getByRole("button", { name: /List view/i }).first().click();
await page.waitForTimeout(400);
await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await page.locator("button", { hasText: /Test Cases/i }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: ".ui-test-artifacts/list-name-testcases.png" });
await page.getByRole("button", { name: /Grid view/i }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".ui-test-artifacts/grid-name-testcases.png" });

const tcLogo = await page.locator(".tb-qa-card .tb-folder-chip").count();
const tcTitleRow = await page.locator(".tb-qa-card-title-row").count();
console.log({ tcLogo, tcTitleRow });
await browser.close();
process.exit(tcLogo && tcTitleRow ? 0 : 1);
