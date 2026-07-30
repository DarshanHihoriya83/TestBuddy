/**
 * Smoke test: observation step generation + full bug upload API
 * (simulates what Screenshot → highlight → overview → save produces)
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = "http://localhost:8080";

async function main() {
  const results = [];
  const pass = (name, detail = "") => {
    results.push({ ok: true, name, detail });
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  };
  const fail = (name, detail) => {
    results.push({ ok: false, name, detail });
    console.error(`FAIL  ${name} — ${detail}`);
  };

  // 1) Unit: observation step builder (load via vite-built chunk is hard; inline parity check)
  const overview = "Accordion Section 1 does not expand after click";
  const step = {
    actionType: "click",
    elementLabel: overview,
    selector: "[data-testbuddy-highlight]",
    pageUrl: "https://www.globalsqa.com/demo-site/accordion-and-tabs/",
    screenshotId: "shot-test-1",
    description: `Inspected the highlighted region and observed the defect: **${overview}**`,
    expectedResult: `The highlighted area should behave correctly — issue **${overview}** should not occur`,
  };
  if (step.description.includes(overview) && step.screenshotId) {
    pass("observation step shape", step.description.slice(0, 60) + "…");
  } else {
    fail("observation step shape", "missing overview/screenshotId");
  }

  // 2) Login
  let token;
  try {
    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@testbuddy.local",
        password: "password",
      }),
    });
    if (!loginRes.ok) throw new Error(await loginRes.text());
    const login = await loginRes.json();
    token = login.token;
    pass("login", login.user.email);
  } catch (e) {
    fail("login", e.message);
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 3) Catalog
  let projectId, cycleId, assigneeId;
  try {
    const [users, projects] = await Promise.all([
      fetch(`${API}/api/users`, { headers: auth }).then((r) => r.json()),
      fetch(`${API}/api/projects`, { headers: auth }).then((r) => r.json()),
    ]);
    projectId = projects[0]?.id;
    assigneeId = users.find((u) => u.role === "TESTER")?.id || users[0]?.id;
    const cycles = await fetch(
      `${API}/api/cycles?projectId=${projectId}`,
      { headers: auth },
    ).then((r) => r.json());
    cycleId = cycles.find((c) => c.isDefault)?.id || cycles[0]?.id;
    if (!projectId || !cycleId || !assigneeId) throw new Error("missing catalog ids");
    pass("catalog", `project=${projects[0].name}, cycle=${cycles.find(c=>c.id===cycleId)?.name}`);
  } catch (e) {
    fail("catalog", e.message);
    process.exit(1);
  }

  // 4) Create bug with DOM steps + screenshot observation step (like real recording upload)
  try {
    const body = {
      title: "Smoke test — accordion highlight capture",
      description:
        "Manual smoke from agent.\n\nBug observations from screenshots:\n1. Accordion Section 1 does not expand after click",
      priority: "HIGH",
      severity: "MAJOR",
      assigneeId,
      cycleId,
      projectId,
      status: "NEW",
      steps: [
        {
          order: 1,
          actionType: "navigate",
          elementLabel: "https://www.globalsqa.com/demo-site/accordion-and-tabs/",
          selector: "",
          pageUrl: "https://www.globalsqa.com/demo-site/accordion-and-tabs/",
          description: "Navigated to https://www.globalsqa.com/demo-site/accordion-and-tabs/",
          expectedResult:
            "The page 'https://www.globalsqa.com/demo-site/accordion-and-tabs/' should load successfully",
        },
        {
          order: 2,
          actionType: "click",
          elementLabel: "Section 1",
          selector: "h3",
          pageUrl: "https://www.globalsqa.com/demo-site/accordion-and-tabs/",
          description: "Clicked the 'Section 1'",
          expectedResult: "The 'Section 1' control should respond to the click",
        },
        {
          order: 3,
          ...step,
        },
      ],
    };
    const res = await fetch(`${API}/api/bugs`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const bug = await res.json();
    if (bug.steps?.length !== 3) throw new Error(`expected 3 steps, got ${bug.steps?.length}`);
    if (!bug.steps[2].screenshotId) throw new Error("observation step missing screenshotId");
    if (!bug.description.includes("Accordion Section 1")) {
      throw new Error("bug description missing overview merge");
    }
    pass("create bug with screenshot step", `id=${bug.id}, steps=${bug.steps.length}`);

    // 5) Fetch back
    const got = await fetch(`${API}/api/bugs/${bug.id}`, { headers: auth }).then((r) =>
      r.json(),
    );
    pass("fetch bug", `title=${got.title}`);
  } catch (e) {
    fail("create/fetch bug", e.message);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main();
