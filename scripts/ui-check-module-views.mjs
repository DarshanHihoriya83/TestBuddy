import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "chrome" });

async function session(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
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
  await page.waitForTimeout(500);
  const link = page.locator(".tb-table a[href^='/projects/']").first();
  if (await link.count()) await link.click({ force: true });
  else await page.locator(".tb-project-card a[href^='/projects/']").first().click({ force: true });
  await page.waitForURL(/\/projects\/[^/]+$/);
  await page.waitForTimeout(700);
  await page.locator('a[href*="/modules/"]').first().click();
  await page.waitForURL(/\/modules\//);
  await page.waitForTimeout(900);
  return page;
}

function overflow(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".tb-mod-stage .tb-table");
    const scroller = table?.closest("div");
    return scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
  });
}

const failures = [];

for (const [w, h] of [
  [1024, 768],
  [1280, 800],
  [1440, 900],
]) {
  const page = await session(w, h);
  const bugsOverflow = await overflow(page);
  await page.screenshot({ path: `.ui-test-artifacts/mod-${w}-bugs-list.png` });

  await page.getByRole("tab", { name: /Test Cases/i }).click();
  await page.waitForTimeout(700);
  const tcOverflow = await overflow(page);
  await page.screenshot({ path: `.ui-test-artifacts/mod-${w}-tc-list.png` });

  await page.locator('button[title*="Grid" i], button[aria-label*="Grid" i]').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `.ui-test-artifacts/mod-${w}-tc-grid.png` });

  console.log(`${w}x${h} bugsOverflow=${bugsOverflow} tcOverflow=${tcOverflow}`);
  if (bugsOverflow > 2) failures.push(`${w}: bugs table overflows ${bugsOverflow}px`);
  if (tcOverflow > 2) failures.push(`${w}: test case table overflows ${tcOverflow}px`);
  await page.close();
}

await browser.close();
if (failures.length) throw new Error(failures.join("; "));
console.log("MODULE_VIEWS_OK");
