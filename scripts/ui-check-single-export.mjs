import { chromium } from "playwright";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:8080";
const downloads = mkdtempSync(join(tmpdir(), "tb-dl-"));

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
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

async function saveDownload(action, label) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), action()]);
  const name = download.suggestedFilename();
  await download.saveAs(join(downloads, name));
  console.log(`${label} download:`, name);
  return name;
}

async function expectModal(title) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  const heading = await dialog.locator("h2").first().innerText();
  if (!new RegExp(title, "i").test(heading)) failures.push(`expected "${title}" modal, got "${heading}"`);
  for (const fmt of ["Excel", "JSON", "PDF"]) {
    if (!(await dialog.getByRole("radio", { name: new RegExp(fmt, "i") }).count())) {
      failures.push(`${title}: ${fmt} format card missing`);
    }
  }
  return dialog;
}

// ---------- Projects page: kebab export ----------
await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.getByRole("button", { name: /^Actions for /i }).first().click();
await page.getByRole("menuitem", { name: /^Export$/ }).click();
let dialog = await expectModal("Export Project");
await page.screenshot({ path: ".ui-test-artifacts/export-project-modal.png" });
await saveDownload(() => dialog.getByRole("button", { name: /Export Project/i }).click(), "project excel");

// ---------- Projects page: single checkbox selection ----------
await page.waitForTimeout(500);
await page.locator('tbody input[type="checkbox"]').first().check();
await page.getByRole("button", { name: /Export selected/i }).click();
dialog = await expectModal("Export Project");
await dialog.getByRole("radio", { name: /PDF/i }).click();
await saveDownload(() => dialog.getByRole("button", { name: /Export Project/i }).click(), "project pdf");

// two selected -> falls back to bulk JSON, no modal
await page.locator('tbody input[type="checkbox"]').nth(1).check();
const jsonName = await saveDownload(
  () => page.getByRole("button", { name: /Export selected/i }).click(),
  "two projects bulk",
);
if (!jsonName.endsWith(".json")) failures.push("multi-select export should stay bulk JSON");
if (await page.getByRole("dialog").count()) failures.push("multi-select should not open single export modal");

// ---------- Project detail: module export ----------
await page.locator('tbody a[href^="/projects/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await page.getByRole("button", { name: /^Actions for /i }).first().click();
await page.getByRole("menuitem", { name: /^Export$/ }).click();
dialog = await expectModal("Export Module");
await page.screenshot({ path: ".ui-test-artifacts/export-module-modal.png" });
await dialog.getByRole("radio", { name: /JSON/i }).click();
await saveDownload(() => dialog.getByRole("button", { name: /Export Module/i }).click(), "module json");

// ---------- Module detail: test case export ----------
await page.locator('tbody a[href*="/modules/"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await page.getByRole("tab", { name: /Test Cases/i }).click().catch(async () => {
  await page.getByRole("button", { name: /Test Cases/i }).first().click();
});
await page.waitForTimeout(900);
const tcKebab = page.getByRole("button", { name: /Test case actions/i });
if (await tcKebab.count()) {
  await tcKebab.first().click();
  await page.getByRole("menuitem", { name: /^Export$/ }).click();
  dialog = await expectModal("Export Test Case");
  await page.screenshot({ path: ".ui-test-artifacts/export-testcase-modal.png" });
  await saveDownload(() => dialog.getByRole("button", { name: /Export Test Case/i }).click(), "test case excel");

  await page.locator('tbody input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: /Export selected/i }).click();
  await expectModal("Export Test Case");
} else {
  failures.push("no test case rows found to export");
}

console.log("downloaded files:", readdirSync(downloads));
console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);
