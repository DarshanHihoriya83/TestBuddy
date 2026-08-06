import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:5173";
const API = "http://localhost:8080";
const NAME = "Imported Check Project";

const dir = mkdtempSync(join(tmpdir(), "tb-import-"));
const goodFile = join(dir, "projects.json");
writeFileSync(
  goodFile,
  JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: 1,
    projects: [{ name: NAME, description: "Imported from export file", jiraProjectKey: "IMP" }],
  }),
);
const badFile = join(dir, "not-a-project.json");
writeFileSync(badFile, JSON.stringify({ hello: "world" }));

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
await page.waitForTimeout(800);

const failures = [];
const createBtn = page.getByRole("button", { name: /Create Project/i }).first();
const importBtn = page.getByRole("button", { name: /Import Project/i }).first();
if (!(await importBtn.count())) failures.push("Import Project button missing");
else {
  const c = await createBtn.boundingBox();
  const i = await importBtn.boundingBox();
  console.log("create", c, "import", i);
  if (i.y <= c.y) failures.push("Import button is not below Create button");
}
await page.screenshot({ path: ".ui-test-artifacts/import-buttons.png" });

// invalid file -> friendly error, nothing created
await page.locator('input[type="file"]').setInputFiles(badFile);
await page.waitForTimeout(1200);
const errToast = await page.locator(".Toastify__toast").first().innerText().catch(() => "");
console.log("invalid file toast:", errToast.replace(/\s+/g, " "));
if (!/No projects found/i.test(errToast)) failures.push(`unexpected toast for invalid file: ${errToast}`);
await page.locator(".Toastify__close-button").first().click().catch(() => {});
await page.waitForTimeout(600);

// valid file -> project created and listed
await page.locator('input[type="file"]').setInputFiles(goodFile);
await page.waitForTimeout(2000);
const okToast = await page.locator(".Toastify__toast").first().innerText().catch(() => "");
console.log("import toast:", okToast.replace(/\s+/g, " "));
await page.waitForTimeout(800);
const listed = await page.getByText(NAME, { exact: true }).count();
console.log({ listed });
if (!listed) failures.push("imported project not visible in the list");
await page.screenshot({ path: ".ui-test-artifacts/import-result.png" });

await browser.close();
if (failures.length) throw new Error(failures.join("; "));
console.log("IMPORT_PROJECT_OK");
