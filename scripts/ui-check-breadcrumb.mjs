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
await page.waitForTimeout(800);
if (await page.locator(".tb-breadcrumb-bar").count()) {
  failures.push("Projects page still renders a breadcrumb");
}
await page.screenshot({ path: ".ui-test-artifacts/breadcrumb-projects.png" });

await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
const detailCrumb = page.locator(".tb-breadcrumb-bar");
if (!(await detailCrumb.count())) failures.push("Project detail page is missing the breadcrumb");
else {
  const text = (await detailCrumb.innerText()).replace(/\s+/g, " ");
  console.log("project detail breadcrumb:", text);
  if (/Home/.test(text)) failures.push("project detail breadcrumb still starts with Home");
  if (!/^Projects/.test(text)) failures.push(`project detail breadcrumb root is not Projects: ${text}`);
}
await page.screenshot({ path: ".ui-test-artifacts/breadcrumb-project-detail.png" });

// root crumb navigates back to the projects list
await detailCrumb.getByRole("link", { name: /^Projects$/ }).click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
if (!/\/projects$/.test(new URL(page.url()).pathname)) {
  failures.push(`Projects crumb did not open /projects (got ${page.url()})`);
}
await page.goBack({ waitUntil: "networkidle" });
await page.waitForTimeout(800);

await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
const modCrumb = page.locator(".tb-breadcrumb-bar");
if (!(await modCrumb.count())) failures.push("Module page is missing the breadcrumb");
else console.log("module breadcrumb:", (await modCrumb.innerText()).replace(/\s+/g, " "));

console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);
