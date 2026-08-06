import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
});
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
await page.waitForTimeout(700);
await page.locator('a[href*="/modules/"]').first().click({ force: true });
await page.waitForURL(/\/modules\//);
await page.waitForTimeout(800);
await page.getByRole("tab", { name: /Test Cases/i }).click();
await page.waitForTimeout(700);

const failures = [];
const rows = () => page.locator(".tb-mod-stage .tb-table tbody tr").count();
const before = await rows();

const passed = page.locator(".tb-mod-stat", { hasText: /^Passed/ }).first();
await passed.click();
await page.waitForTimeout(700);
const afterPassed = await rows();
const chipText = await page.locator(".tb-mod-filter-chips").innerText().catch(() => "");
const pressed = await passed.getAttribute("aria-pressed");
console.log({ before, afterPassed, pressed, chip: chipText.replace(/\s+/g, " ") });
if (afterPassed !== 3) failures.push(`expected 3 passed rows, got ${afterPassed}`);
if (pressed !== "true") failures.push("Passed pill is not marked active");
if (!/Status/i.test(chipText)) failures.push("no status filter chip shown");
await page.screenshot({ path: ".ui-test-artifacts/statline-filtered.png" });

// clicking again clears the filter
await passed.click();
await page.waitForTimeout(700);
const afterToggleOff = await rows();
console.log({ afterToggleOff });
if (afterToggleOff !== before) failures.push(`toggle off did not restore rows (${afterToggleOff})`);

// Total pill clears any status filter
await page.locator(".tb-mod-stat", { hasText: /^Blocked/ }).first().click();
await page.waitForTimeout(600);
await page.locator(".tb-mod-stat", { hasText: /^Total/ }).first().click();
await page.waitForTimeout(600);
const afterTotal = await rows();
if (afterTotal !== before) failures.push(`Total pill did not reset rows (${afterTotal})`);

// bugs tab statline renders too
await page.getByRole("tab", { name: /Bugs/i }).click();
await page.waitForTimeout(700);
const bugStats = await page.locator(".tb-mod-statline .tb-mod-stat").count();
console.log({ bugStats });
if (bugStats !== 5) failures.push(`expected 5 bug stat pills, got ${bugStats}`);
await page.screenshot({ path: ".ui-test-artifacts/statline-bugs.png" });

await browser.close();
if (failures.length) throw new Error(failures.join("; "));
console.log("STATLINE_OK");
