/**
 * Deep UI smoke for recent Manager/Module/TestCase changes.
 * Requires: backend :8080, frontend :5173
 * Run: node scripts/ui-deep-test.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.UI_BASE || "http://localhost:5173";
const API = process.env.API_BASE || "http://localhost:8080";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../.ui-test-artifacts");
mkdirSync(OUT, { recursive: true });

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}
async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

async function login(page, email = "carol@testbuddy.local", password = "password") {
  // Prefer API session inject — avoids flaky form/proxy timing (502) during automation.
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  if (!body?.token || !body?.user) throw new Error("API login missing token/user");

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("testbuddy_token", token);
      localStorage.setItem("testbuddy_user", JSON.stringify(user));
    },
    { token: body.token, user: body.user },
  );
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    throw new Error("Session inject failed — still on login");
  }
}

async function openFirstProject(page) {
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const link = page.locator('a[href^="/projects/"]').filter({ hasNotText: /^$/ }).first();
  const href = await link.getAttribute("href");
  if (!href) throw new Error("No project link found");
  await link.click();
  await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 15000 });
  return href;
}

async function openFirstModule(page) {
  await page.waitForTimeout(600);
  const modLink = page.locator('a[href*="/modules/"]').first();
  await modLink.waitFor({ timeout: 15000 });
  const href = await modLink.getAttribute("href");
  await modLink.click();
  await page.waitForURL(/\/modules\//, { timeout: 15000 });
  return href;
}

async function kebabItems(page, kebabBtn) {
  await kebabBtn.click();
  const menu = page.locator('[role="menu"]').last();
  await menu.waitFor({ state: "visible", timeout: 5000 });
  const labels = await menu.locator('[role="menuitem"]').allTextContents();
  const text = labels.map((t) => t.trim().replace(/\s+/g, " "));
  await page.keyboard.press("Escape").catch(() => {});
  // click outside to close
  await page.mouse.click(8, 8).catch(() => {});
  await page.waitForTimeout(200);
  return text;
}

function assertOrder(items, expectedSeq, name) {
  const idx = expectedSeq.map((label) => items.findIndex((i) => i === label || i.startsWith(label)));
  for (let i = 0; i < idx.length; i++) {
    if (idx[i] < 0) {
      fail(name, `missing "${expectedSeq[i]}" in menu: [${items.join(" | ")}]`);
      return false;
    }
  }
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] <= idx[i - 1]) {
      fail(name, `order wrong: expected ${expectedSeq.join(" → ")}, got [${items.join(" | ")}]`);
      return false;
    }
  }
  pass(name, items.join(" → "));
  return true;
}

async function main() {
  console.log(`UI deep test → ${BASE}`);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // --- Login ---
    try {
      await login(page);
      pass("Login as Manager", page.url());
      await shot(page, "01-after-login");
    } catch (e) {
      fail("Login as Manager", String(e));
      throw e;
    }

    // --- Projects page: quota text gone + kebab Export ---
    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await shot(page, "02-projects");

    const createBtn = page.getByRole("button", { name: /create project/i }).first();
    if (await createBtn.count()) {
      await createBtn.click();
      await page.waitForTimeout(400);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      const body = await dialog.innerText();
      if (/Org quota|Your quota/i.test(body)) {
        fail("Create project — no quota text", body.slice(0, 200));
      } else {
        pass("Create project — no quota text");
      }
      if (!/Create project/i.test(body)) fail("Create project dialog title", body.slice(0, 120));
      else pass("Create project dialog opens");
      await shot(page, "03-create-project-modal");
      await dialog.getByRole("button", { name: /Close/i }).click();
      await page.waitForTimeout(400);
      // ensure overlay gone
      if (await page.locator(".tb-modal-overlay").count()) {
        await page.locator(".tb-modal-overlay").first().click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(300);
      }
    } else {
      fail("Create project button", "not found");
    }

    // Project kebab (list or grid)
    const projectKebab = page.locator(".tb-kebab-btn").first();
    if (await projectKebab.count()) {
      const items = await kebabItems(page, projectKebab);
      assertOrder(items, ["View", "Export"], "Projects kebab: Export under View");
      if (items.includes("Edit")) {
        const v = items.indexOf("View");
        const e = items.indexOf("Export");
        const ed = items.indexOf("Edit");
        if (e > v && ed > e) pass("Projects kebab: View → Export → Edit");
        else fail("Projects kebab: View → Export → Edit", items.join(" | "));
      }
    } else {
      fail("Projects kebab", "no kebab button");
    }

    // --- Project → Modules ---
    await openFirstProject(page);
    await shot(page, "04-project-detail");
    const moduleKebab = page.locator(".tb-kebab-btn").first();
    if (await moduleKebab.count()) {
      const items = await kebabItems(page, moduleKebab);
      assertOrder(items, ["View", "Export"], "Modules kebab: Export under View");
    } else {
      fail("Modules kebab", "no kebab on project page");
    }

    // --- Module page: hero, tabs, bugs export selected, TC section ---
    await openFirstModule(page);
    await page.waitForTimeout(800);
    await shot(page, "05-module-page");

    const hero = page.locator(".tb-mod-hero, .tb-mod-workspace").first();
    if (await hero.count()) pass("Module hero / workspace present");
    else fail("Module hero / workspace present", "missing");

    const bugsTab = page.getByRole("tab", { name: /Bugs/i });
    const tcTab = page.getByRole("tab", { name: /Test Cases/i });
    if ((await bugsTab.count()) && (await tcTab.count())) pass("Module tabs: Bugs + Test Cases");
    else fail("Module tabs: Bugs + Test Cases", "missing tab(s)");

    // Bugs tab — Export selected disabled when none selected
    if (await bugsTab.count()) {
      await bugsTab.click();
      await page.waitForTimeout(400);
      const exportSel = page.getByRole("button", { name: /Export selected/i });
      if (await exportSel.count()) {
        // clear any selection
        const checks = page.locator('.tb-table tbody input[type="checkbox"]');
        const n = await checks.count();
        for (let i = 0; i < n; i++) {
          if (await checks.nth(i).isChecked()) await checks.nth(i).uncheck();
        }
        await page.waitForTimeout(200);
        const disabled = await exportSel.isDisabled();
        if (disabled) pass("Bugs: Export selected disabled with no selection");
        else fail("Bugs: Export selected disabled with no selection", "button enabled");

        if (n > 0) {
          await checks.first().check();
          await page.waitForTimeout(200);
          if (!(await exportSel.isDisabled())) pass("Bugs: Export selected enables after select");
          else fail("Bugs: Export selected enables after select", "still disabled");
          await checks.first().uncheck();
        }
      } else {
        fail("Bugs Export selected button", "not found");
      }
    }

    // Test Cases tab
    await tcTab.click();
    await page.waitForTimeout(600);
    await shot(page, "06-test-cases-tab");

    const tcExportSel = page.getByRole("button", { name: /Export selected/i });
    if (await tcExportSel.count()) {
      const checks = page.locator('.tb-table tbody input[type="checkbox"]');
      const n = await checks.count();
      for (let i = 0; i < n; i++) {
        if (await checks.nth(i).isChecked()) await checks.nth(i).uncheck();
      }
      await page.waitForTimeout(200);
      if (await tcExportSel.isDisabled()) pass("Test Cases: Export selected disabled with no selection");
      else fail("Test Cases: Export selected disabled with no selection", "button enabled");

      if (n > 0) {
        await checks.first().check();
        await page.waitForTimeout(200);
        if (!(await tcExportSel.isDisabled())) pass("Test Cases: Export selected enables after select");
        else fail("Test Cases: Export selected enables after select", "still disabled");

        // export selected should download
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
          tcExportSel.click(),
        ]);
        if (download) pass("Test Cases: Export selected downloads file", await download.suggestedFilename());
        else fail("Test Cases: Export selected downloads file", "no download event");
        await checks.first().uncheck();
      } else {
        pass("Test Cases: empty table — skip select/download checks");
      }
    } else {
      fail("Test Cases Export selected button", "not found");
    }

    // Stats + toolbar
    const stats = page.locator(".tb-bug-stat");
    const statCount = await stats.count();
    if (statCount >= 4) pass("Test Cases stats tiles", `${statCount} tiles`);
    else fail("Test Cases stats tiles", `only ${statCount}`);

    if (await page.locator(".tb-mod-toolbar").count()) pass("Test Cases toolbar present");
    else fail("Test Cases toolbar present", "missing");

    // TC kebab Export under View
    const tcKebab = page.locator(".tb-table .tb-kebab-btn, .tb-kebab-btn").first();
    if ((await page.locator(".tb-table tbody tr").count()) > 0 && (await tcKebab.count())) {
      const items = await kebabItems(page, tcKebab);
      assertOrder(items, ["View", "Export"], "Test Cases kebab: Export under View");
      if (items.includes("Edit")) {
        const v = items.indexOf("View");
        const e = items.indexOf("Export");
        const ed = items.indexOf("Edit");
        if (e > v && ed > e) pass("Test Cases kebab: View → Export → Edit");
        else fail("Test Cases kebab: View → Export → Edit", items.join(" | "));
      }

      // single export download
      await tcKebab.click();
      const menu = page.locator('[role="menu"]').last();
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
        menu.getByRole("menuitem", { name: /^Export$/i }).click(),
      ]);
      if (dl) pass("Test Cases kebab Export downloads JSON", await dl.suggestedFilename());
      else fail("Test Cases kebab Export downloads JSON", "no download");
    } else {
      pass("Test Cases kebab — skipped (no rows)");
    }

    // New Test Case modal (if button exists)
    const newTc = page.getByRole("button", { name: /New Test Case/i });
    if (await newTc.count()) {
      await newTc.click();
      await page.waitForTimeout(300);
      const dlg = page.getByRole("dialog");
      if (await dlg.isVisible()) {
        pass("New Test Case modal opens");
        await shot(page, "07-new-testcase-modal");
        await dlg.getByRole("button", { name: /Close/i }).click();
        await page.waitForTimeout(300);
        if (await page.locator(".tb-modal-overlay").count()) {
          await page.locator(".tb-modal-overlay").first().click({ position: { x: 5, y: 5 } });
          await page.waitForTimeout(200);
        }
      } else fail("New Test Case modal opens", "not visible");
    }

    // Switch back to Bugs — pagination / empty state shouldn't crash
    await bugsTab.click({ force: true });
    await page.waitForTimeout(400);
    await shot(page, "08-bugs-tab-again");
    pass("Tab switch Bugs ↔ Test Cases stable");

    // Bugs kebab Export under View
    await page.waitForTimeout(300);
    const bugRows = page.locator(".tb-table tbody tr");
    if ((await bugRows.count()) > 0) {
      const bugKebab = page.locator(".tb-table .tb-kebab-btn").first();
      const items = await kebabItems(page, bugKebab);
      assertOrder(items, ["View", "Export"], "Bugs kebab: Export under View");
    } else {
      pass("Bugs kebab — skipped (no rows)");
    }

    // Bugs Export selected enable path
    const bugExportSel = page.getByRole("button", { name: /Export selected/i });
    const bugChecks = page.locator('.tb-table tbody input[type="checkbox"]');
    if ((await bugExportSel.count()) && (await bugChecks.count()) > 0) {
      await bugChecks.first().check();
      await page.waitForTimeout(200);
      if (!(await bugExportSel.isDisabled())) pass("Bugs: Export selected enables after select");
      else fail("Bugs: Export selected enables after select", "still disabled");
      await bugChecks.first().uncheck();
    }

    // API sanity for testcases used by UI
    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@testbuddy.local", password: "password" }),
    });
    const loginJson = await loginRes.json();
    const token = loginJson.token;
    const mods = page.url().match(/\/projects\/([^/]+)\/modules\/([^/?#]+)/);
    if (mods && token) {
      const [, projectId, moduleId] = mods;
      const tcRes = await fetch(
        `${API}/api/testcases?projectId=${projectId}&moduleId=${moduleId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (tcRes.ok) pass("API GET /api/testcases for module", `status ${tcRes.status}`);
      else fail("API GET /api/testcases for module", `status ${tcRes.status}`);
    }
  } catch (e) {
    fail("Fatal UI run", String(e));
    await shot(page, "99-fatal").catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n──────── summary ────────");
  console.log(`Passed: ${results.filter((r) => r.ok).length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Screenshots: ${OUT}`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
