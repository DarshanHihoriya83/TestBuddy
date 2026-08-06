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

async function checkGrid(label, selectAllLabel, shot) {
  await page.getByRole("button", { name: /Grid view/i }).first().click();
  await page.waitForTimeout(700);
  const selectAll = page.getByRole("checkbox", { name: selectAllLabel });
  if (!(await selectAll.count())) {
    failures.push(`${label}: select-all checkbox missing in grid view`);
    return;
  }
  const cards = page.locator(".tb-project-card");
  const cardCount = await cards.count();
  const countText = await page.locator(".tb-mod-grid-head-count").first().innerText();
  if (!countText.includes(String(cardCount))) {
    failures.push(`${label}: header count "${countText}" does not match ${cardCount} cards`);
  }
  await selectAll.check();
  await page.waitForTimeout(400);
  const selectedCards = await page.locator(".tb-project-card.is-selected").count();
  if (selectedCards !== cardCount) {
    failures.push(`${label}: checked select-all selected ${selectedCards}/${cardCount} cards`);
  }
  const bulkBar = await page.getByRole("button", { name: /Export selected/i }).count();
  if (!bulkBar) failures.push(`${label}: bulk bar did not appear after select all`);
  await page.screenshot({ path: `.ui-test-artifacts/${shot}` });
  await selectAll.uncheck();
  await page.waitForTimeout(400);
  if (await page.locator(".tb-project-card.is-selected").count()) {
    failures.push(`${label}: unchecking select-all left cards selected`);
  }
  console.log(`${label}: ${cardCount} cards, header "${countText}" — OK`);
}

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await checkGrid("Projects", /Select all projects on this page/i, "grid-selectall-projects.png");

await page.getByRole("button", { name: /List view/i }).first().click();
await page.waitForTimeout(500);
await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await checkGrid("Modules", /Select all modules on this page/i, "grid-selectall-modules.png");

console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);
