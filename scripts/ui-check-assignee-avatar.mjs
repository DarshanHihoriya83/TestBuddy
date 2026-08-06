import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:8080";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await page.screenshot({ path: ".ui-test-artifacts/assignee-avatar-debug.png" });
console.log("url before tab click:", page.url());
await page.locator("button", { hasText: /Test Cases/i }).first().click();
await page.waitForTimeout(900);

async function checkAvatars(label, shot) {
  const avatars = page.locator("tbody .tb-avatar-sm, .tb-qa-card .tb-avatar-sm");
  const count = await avatars.count();
  if (!count) {
    failures.push(`${label}: no assignee avatars rendered`);
    return;
  }
  const texts = await avatars.allInnerTexts();
  console.log(`${label}: ${count} avatars, samples ${texts.slice(0, 3).join(", ")}`);
  if (texts.some((t) => !t.trim())) failures.push(`${label}: an avatar rendered empty initials`);
  await page.screenshot({ path: `.ui-test-artifacts/${shot}` });
}

await checkAvatars("Test cases list", "assignee-avatar-tc-list.png");
await page.getByRole("button", { name: /Grid view/i }).first().click();
await page.waitForTimeout(800);
await checkAvatars("Test cases grid", "assignee-avatar-tc-grid.png");

console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);
