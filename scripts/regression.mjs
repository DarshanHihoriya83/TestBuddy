/**
 * TestBuddy full regression suite — backend API + extension artifacts.
 * Run: node scripts/regression.mjs
 */
const API = process.env.API_BASE || "http://localhost:8080";
const EXT_DIST = new URL("../extension/dist/", import.meta.url);
const EXT_ZIP = new URL("../backend/public/downloads/TestBuddy-extension.zip", import.meta.url);

const results = [];
let token = "";
let userId = "";
let projectId = "";
let cycleId = "";
let assigneeId = "";
let bugId = "";
let createdProjectId = "";

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}

async function testHealth() {
  const { res, json } = await api("/api/health");
  if (res.ok && json?.status === "ok") pass("GET /api/health", json.service);
  else fail("GET /api/health", `${res.status} ${JSON.stringify(json)}`);
}

async function testAuth() {
  const bad = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "alice@testbuddy.local", password: "wrong" }),
  });
  if (bad.res.status === 401) pass("POST /api/auth/login rejects bad password");
  else fail("POST /api/auth/login rejects bad password", `status ${bad.res.status}`);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "alice@testbuddy.local", password: "password" }),
  });
  if (!login.res.ok || !login.json?.token) {
    fail("POST /api/auth/login", login.text);
    throw new Error("login blocked remaining tests");
  }
  token = login.json.token;
  userId = login.json.user.id;
  pass("POST /api/auth/login", login.json.user.email);

  const me = await api("/api/auth/me");
  if (me.res.ok && me.json?.id === userId) pass("GET /api/auth/me");
  else fail("GET /api/auth/me", me.text);

  const email = `regression-${Date.now()}@testbuddy.local`;
  const reg = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Regression User",
      email,
      password: "password123",
      role: "TESTER",
    }),
  });
  if (reg.res.ok && reg.json?.token) pass("POST /api/auth/register", email);
  else fail("POST /api/auth/register", reg.text);

  const dup = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Dup", email, password: "password123" }),
  });
  if (dup.res.status === 409) pass("POST /api/auth/register conflict");
  else fail("POST /api/auth/register conflict", `status ${dup.res.status}`);
}

async function testCatalog() {
  const users = await api("/api/users");
  if (users.res.ok && Array.isArray(users.json) && users.json.length >= 4) {
    pass("GET /api/users", `${users.json.length} users`);
    assigneeId = users.json.find((u) => u.role === "TESTER")?.id || users.json[0].id;
  } else fail("GET /api/users", users.text);

  const projects = await api("/api/projects");
  if (projects.res.ok && Array.isArray(projects.json)) {
    pass("GET /api/projects", `${projects.json.length} project(s)`);
    projectId = projects.json[0]?.id;
  } else fail("GET /api/projects", projects.text);

  const create = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: `Regression ${Date.now()}` }),
  });
  if (create.res.status === 201 && create.json?.id) {
    createdProjectId = create.json.id;
    pass("POST /api/projects", create.json.name);
  } else fail("POST /api/projects", create.text);

  const detail = await api(`/api/projects/${createdProjectId}`);
  if (detail.res.ok && detail.json?.cycleCount >= 1) {
    pass("GET /api/projects/:id", `cycles=${detail.json.cycleCount}`);
  } else fail("GET /api/projects/:id", detail.text);

  const cycles = await api(`/api/cycles?projectId=${createdProjectId}`);
  if (cycles.res.ok && cycles.json?.length >= 1) {
    cycleId = cycles.json.find((c) => c.isDefault)?.id || cycles.json[0].id;
    pass("GET /api/cycles", `${cycles.json.length} cycle(s)`);
  } else fail("GET /api/cycles", cycles.text);

  const noProject = await api("/api/cycles");
  if (noProject.res.status === 400) pass("GET /api/cycles requires projectId");
  else fail("GET /api/cycles requires projectId", `status ${noProject.res.status}`);
}

async function testBugs() {
  const list = await api("/api/bugs");
  if (list.res.ok && Array.isArray(list.json)) pass("GET /api/bugs", `${list.json.length} bug(s)`);
  else fail("GET /api/bugs", list.text);

  const shotId = crypto.randomUUID();
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const body = {
    title: "Regression bug",
    description: "Automated regression test bug",
    priority: "MEDIUM",
    severity: "MAJOR",
    assigneeId,
    cycleId,
    projectId: createdProjectId,
    status: "NEW",
    steps: [
      {
        order: 1,
        actionType: "navigate",
        elementLabel: "https://example.com",
        selector: "",
        pageUrl: "https://example.com",
        description: "Navigated to https://example.com",
        expectedResult: "Page loads",
      },
      {
        order: 2,
        actionType: "click",
        elementLabel: "Submit",
        selector: "button.submit",
        pageUrl: "https://example.com",
        description: "Clicked the 'Submit' button",
        expectedResult: "Form submits",
        screenshotId: shotId,
      },
    ],
    screenshots: [
      {
        id: shotId,
        dataUrl: tinyPng,
        overview: "Submit did nothing",
        pageUrl: "https://example.com",
        annotations: [{ type: "rect", x: 10, y: 10, w: 40, h: 20 }],
      },
    ],
  };

  const create = await api("/api/bugs", { method: "POST", body: JSON.stringify(body) });
  if (
    create.res.status === 201 &&
    create.json?.steps?.length === 2 &&
    create.json?.screenshots?.length === 1
  ) {
    bugId = create.json.id;
    pass("POST /api/bugs", `id=${bugId} screenshots=1`);
  } else fail("POST /api/bugs", create.text);

  const get = await api(`/api/bugs/${bugId}`);
  if (get.res.ok && get.json?.steps?.[1]?.screenshotId === shotId) pass("GET /api/bugs/:id");
  else fail("GET /api/bugs/:id", get.text);

  {
    const res = await fetch(`${API}/api/screenshots/${shotId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("image")) pass("GET /api/screenshots/:id");
    else fail("GET /api/screenshots/:id", `${res.status} ${ct}`);
  }

  const update = await api(`/api/bugs/${bugId}`, {
    method: "PUT",
    body: JSON.stringify({ ...body, title: "Regression bug updated", status: "OPEN" }),
  });
  if (update.res.ok && update.json?.status === "OPEN") pass("PUT /api/bugs/:id");
  else fail("PUT /api/bugs/:id", update.text);

  const exportAll = await api("/api/bugs/export/json");
  if (exportAll.res.ok && exportAll.json?.bugs?.length >= 1) {
    pass("GET /api/bugs/export/json", `count=${exportAll.json.count}`);
  } else fail("GET /api/bugs/export/json", exportAll.text);

  const exportOne = await api(`/api/bugs/${bugId}/export/json`);
  if (exportOne.res.ok && exportOne.json?.count === 1) pass("GET /api/bugs/:id/export/json");
  else fail("GET /api/bugs/:id/export/json", exportOne.text);

  const importRes = await api("/api/bugs/import", {
    method: "POST",
    body: JSON.stringify({
      bugs: [
        {
          title: "Imported regression bug",
          description: "import test",
          priority: "LOW",
          severity: "MINOR",
          assigneeId,
          cycleId,
          projectId: createdProjectId,
          steps: [],
        },
      ],
    }),
  });
  if (importRes.res.ok && importRes.json?.imported === 1) {
    pass("POST /api/bugs/import", `imported=${importRes.json.imported}`);
  } else fail("POST /api/bugs/import", importRes.text);

  const filter = await api(`/api/bugs?projectId=${createdProjectId}&status=OPEN`);
  if (filter.res.ok && filter.json.some((b) => b.id === bugId)) {
    pass("GET /api/bugs filters");
  } else fail("GET /api/bugs filters", filter.text);

  const badRefs = await api("/api/bugs", {
    method: "POST",
    body: JSON.stringify({ ...body, cycleId: "00000000-0000-0000-0000-000000000000" }),
  });
  if (badRefs.res.status === 400) pass("POST /api/bugs validates refs");
  else fail("POST /api/bugs validates refs", `status ${badRefs.res.status}`);
}

async function testExtensionDownload() {
  const res = await fetch(`${API}/api/extension/download`);
  if (!res.ok) {
    fail("GET /api/extension/download", `status ${res.status}`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 1000) pass("GET /api/extension/download", `${buf.length} bytes`);
  else fail("GET /api/extension/download", "file too small");
}

async function testAuthGuards() {
  const saved = token;
  token = "";
  const users = await api("/api/users");
  if (users.res.status === 401) pass("Protected routes require JWT");
  else fail("Protected routes require JWT", `status ${users.res.status}`);
  token = saved;
}

async function testCleanup() {
  // DELETE bug
  if (bugId) {
    const delBug = await api(`/api/bugs/${bugId}`, { method: "DELETE" });
    if (delBug.res.status === 204) pass("DELETE /api/bugs/:id");
    else fail("DELETE /api/bugs/:id", `status ${delBug.res.status}`);
    const gone = await api(`/api/bugs/${bugId}`);
    if (gone.res.status === 404) pass("Deleted bug returns 404");
    else fail("Deleted bug returns 404", `status ${gone.res.status}`);
  }

  // Cascade: project with remaining bugs (if any) still deletes
  const withBugs = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: `Cascade ${Date.now()}` }),
  });
  const cascadeId = withBugs.json?.id;
  if (cascadeId) {
    const cycles = await api(`/api/cycles?projectId=${cascadeId}`);
    const cycleId = cycles.json?.[0]?.id;
    const users = await api("/api/users");
    const assigneeId = users.json?.[0]?.id;
    if (cycleId && assigneeId) {
      await api("/api/bugs", {
        method: "POST",
        body: JSON.stringify({
          title: "Cascade delete me",
          description: "temp",
          priority: "MEDIUM",
          severity: "MINOR",
          assigneeId,
          cycleId,
          projectId: cascadeId,
          status: "NEW",
          steps: [],
        }),
      });
    }
    const delCascade = await api(`/api/projects/${cascadeId}`, { method: "DELETE" });
    if (delCascade.res.status === 204) pass("DELETE /api/projects cascades bugs");
    else fail("DELETE /api/projects cascades bugs", `status ${delCascade.res.status}`);
  }

  // Empty project delete
  const empty = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: `Empty ${Date.now()}` }),
  });
  const emptyId = empty.json?.id;
  if (emptyId) {
    const del = await api(`/api/projects/${emptyId}`, { method: "DELETE" });
    if (del.res.status === 204) pass("DELETE /api/projects empty");
    else fail("DELETE /api/projects empty", `status ${del.res.status}`);
  }

  // Cleanup created project from earlier tests (may still have bugs)
  if (createdProjectId) {
    const delProj = await api(`/api/projects/${createdProjectId}`, { method: "DELETE" });
    if (delProj.res.status === 204) pass("DELETE /api/projects cleanup");
    else fail("DELETE /api/projects cleanup", `status ${delProj.res.status}`);
  }
}

async function testExtensionArtifacts() {
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const distPath = fileURLToPath(EXT_DIST);
  const zipPath = fileURLToPath(EXT_ZIP);

  const required = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
  ];
  for (const f of required) {
    const p = path.join(distPath, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) pass(`extension/dist/${f}`);
    else fail(`extension/dist/${f}`, "missing or empty");
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(distPath, "manifest.json"), "utf8"));
  if (manifest.manifest_version === 3) pass("extension manifest MV3");
  else fail("extension manifest MV3", `version ${manifest.manifest_version}`);

  const perms = manifest.permissions || [];
  if (perms.includes("scripting") && perms.includes("tabs")) {
    pass("extension permissions", perms.join(", "));
  } else fail("extension permissions", JSON.stringify(perms));

  const content = fs.readFileSync(path.join(distPath, "content.js"), "utf8");
  const features = [
    ["Screenshot button", "Screenshot"],
    ["Annotate overlay", "testbuddy-annotate-overlay"],
    ["Top-frame guard", "window.top"],
    ["SAVE_BUG_CAPTURE", "SAVE_BUG_CAPTURE"],
    ["CAPTURE_VISIBLE_TAB", "CAPTURE_VISIBLE_TAB"],
  ];
  for (const [name, needle] of features) {
    if (content.includes(needle)) pass(`extension content: ${name}`);
    else fail(`extension content: ${name}`, "not found in bundle");
  }

  const bg = fs.readFileSync(path.join(distPath, "background.js"), "utf8");
  if (bg.includes("captureVisibleTab") && bg.includes("screenshots")) {
    pass("extension background screenshot support");
  } else fail("extension background screenshot support");

  if (fs.existsSync(zipPath)) {
    const zipSize = fs.statSync(zipPath).size;
    if (zipSize > 5000) pass("extension zip packaged", `${zipSize} bytes`);
    else fail("extension zip packaged", "too small");
  } else fail("extension zip packaged", "missing");

  const popupHtml = fs.readFileSync(path.join(distPath, "popup.html"), "utf8");
  if (popupHtml.includes("./popup.js") && !popupHtml.includes('src="/popup.js"')) {
    pass("extension popup relative paths");
  } else fail("extension popup relative paths");
}

async function testFrontendProxy() {
  try {
    const res = await fetch("http://localhost:5173/api/health");
    const json = await res.json();
    if (res.ok && json?.status === "ok") pass("frontend Vite proxy /api -> backend");
    else fail("frontend Vite proxy", JSON.stringify(json));
  } catch (e) {
    fail("frontend Vite proxy", e.message);
  }
}

async function testAiService() {
  try {
    const res = await fetch("http://127.0.0.1:8001/health");
    const json = await res.json();
    if (res.ok && json?.status === "ok") pass("AI service health", json.service);
    else fail("AI service health", JSON.stringify(json));
  } catch (e) {
    fail("AI service health", e.message);
  }
}

async function main() {
  console.log("TestBuddy regression suite\n==========================\n");
  try {
    await testHealth();
    await testAuth();
    await testAuthGuards();
    await testCatalog();
    await testBugs();
    await testExtensionDownload();
    await testCleanup();
    await testExtensionArtifacts();
    await testFrontendProxy();
    await testAiService();
  } catch (e) {
    console.error("Suite aborted:", e.message);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==========================`);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main();
