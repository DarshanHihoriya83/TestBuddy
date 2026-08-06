import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const res = await page.request.post("http://127.0.0.1:8080/api/auth/login", {
  data: { email: "carol@testbuddy.local", password: "password" },
});
const body = await res.json();
await page.goto("http://localhost:5173/login");
await page.evaluate(
  ({ token, user }) => {
    localStorage.setItem("testbuddy_token", token);
    localStorage.setItem("testbuddy_user", JSON.stringify(user));
  },
  { token: body.token, user: body.user },
);
await page.goto("http://localhost:5173/projects", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
await page.locator("button", { hasText: /Test Cases/i }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Grid view/i }).first().click();
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
  const row = document.querySelector(".tb-qa-card-title-row");
  const chip = row?.querySelector(".tb-folder-chip");
  const title = row?.querySelector(".tb-qa-card-title");
  const c = chip?.getBoundingClientRect();
  const t = title?.getBoundingClientRect();
  const style = title ? getComputedStyle(title) : null;
  return {
    chip: c && { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) },
    title: t && { x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.width), h: Math.round(t.height) },
    sameRow: !!(c && t && Math.abs(c.top - t.top) < 16),
    titleRightOfChip: !!(c && t && t.left >= c.right - 2),
    titleDisplay: style?.display,
    titleWidth: style?.width,
  };
});
console.log(JSON.stringify(box, null, 2));
await browser.close();
process.exit(box.sameRow && box.titleRightOfChip ? 0 : 1);
