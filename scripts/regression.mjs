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
let organizationId = "";
let moduleId = "";

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

/** Alphabetical-only unique names (letters + spaces; no digits). */
function uniqueAlphaName(prefix = "Regression Name") {
  const letters = Date.now()
    .toString(36)
    .replace(/[^a-z]/gi, "");
  const name = `${prefix} ${letters || "x"}`.replace(/\s+/g, " ").trim();
  return name.slice(0, 100);
}

/** Alphabetical-only unique project names (letters + spaces; no digits). */
function uniqueProjectName(prefix = "Regression Project") {
  return uniqueAlphaName(prefix);
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

async function loginAs(email, password = "password") {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!login.res.ok || !login.json?.token) {
    throw new Error(`login failed for ${email}: ${login.text}`);
  }
  token = login.json.token;
  userId = login.json.user.id;
  return login.json.user;
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
      role: "MANAGER",
    }),
  });
  if (reg.res.ok && reg.json?.token && reg.json?.user?.role === "TESTER") {
    pass("POST /api/auth/register", `${email} (forced TESTER)`);
  } else fail("POST /api/auth/register", reg.text || `role=${reg.json?.user?.role}`);

  // New signups must see Demo org projects (auto-enrolled)
  const prevToken = token;
  token = reg.json?.token;
  const enrolled = await api("/api/projects");
  if (enrolled.res.ok && Array.isArray(enrolled.json) && enrolled.json.length >= 1) {
    pass("Register enrolls into demo projects", `${enrolled.json.length} project(s)`);
  } else fail("Register enrolls into demo projects", enrolled.text);
  token = prevToken;

  const dup = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Dup", email, password: "password123" }),
  });
  if (dup.res.status === 409) pass("POST /api/auth/register conflict");
  else fail("POST /api/auth/register conflict", `status ${dup.res.status}`);
}

async function testCatalog() {
  await loginAs("carol@testbuddy.local");

  const users = await api("/api/users");
  if (users.res.ok && Array.isArray(users.json) && users.json.length >= 4) {
    pass("GET /api/users", `${users.json.length} users`);
    assigneeId = users.json.find((u) => u.role === "TESTER")?.id || users.json[0].id;
  } else fail("GET /api/users", users.text);

  const aliceMemberId = users.json?.find((u) => u.email === "alice@testbuddy.local")?.id;
  const bobMemberId = users.json?.find((u) => u.email === "bob@testbuddy.local")?.id;

  const orgs = await api("/api/organizations");
  if (orgs.res.ok && Array.isArray(orgs.json) && orgs.json.length >= 1) {
    organizationId = orgs.json[0].id;
    pass("GET /api/organizations", `${orgs.json.length} org(s)`);
  } else fail("GET /api/organizations", orgs.text);

  // Ensure Manager has headroom under project create quota (MAX_PROJECTS_PER_MANAGER)
  const quotaBefore = await api("/api/projects/quota");
  if (
    quotaBefore.res.ok &&
    typeof quotaBefore.json?.limit === "number" &&
    quotaBefore.json.limit > 0
  ) {
    pass(
      "GET /api/projects/quota (Manager)",
      `used=${quotaBefore.json.used} limit=${quotaBefore.json.limit}`,
    );
    let remaining = quotaBefore.json.remaining ?? 0;
    if (remaining < 3) {
      const mine = await api("/api/projects");
      for (const p of mine.json || []) {
        if (remaining >= 3) break;
        if (!/^(Regression |Mgr|Second|Cascade |Empty |Quota)/i.test(p.name || "")) continue;
        const del = await api(`/api/projects/${p.id}`, { method: "DELETE" });
        if (del.res.status === 204 || del.res.ok) remaining += 1;
      }
    }
  } else fail("GET /api/projects/quota (Manager)", quotaBefore.text);

  await loginAs("bob@testbuddy.local");
  const bobQuota = await api("/api/projects/quota");
  if (bobQuota.res.ok && bobQuota.json?.limit === 0) {
    pass("GET /api/projects/quota (Developer) — cannot create");
  } else fail("GET /api/projects/quota (Developer) — cannot create", bobQuota.text);
  await loginAs("carol@testbuddy.local");

  const projects = await api("/api/projects");
  if (projects.res.ok && Array.isArray(projects.json)) {
    pass("GET /api/projects", `${projects.json.length} project(s)`);
    projectId = projects.json[0]?.id;
  } else fail("GET /api/projects", projects.text);

  const create = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProjectName("Regression Project"),
      organizationId,
    }),
  });
  if (create.res.status === 201 && create.json?.id) {
    createdProjectId = create.json.id;
    pass("POST /api/projects", create.json.name);

    if (aliceMemberId) {
      const addAlice = await api(`/api/projects/${createdProjectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: aliceMemberId }),
      });
      if (addAlice.res.status === 201 || addAlice.res.ok) {
        pass("Manager adds Tester to regression project");
      } else fail("Manager adds Tester to regression project", addAlice.text);
    }
    if (bobMemberId) {
      const addBob = await api(`/api/projects/${createdProjectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: bobMemberId }),
      });
      if (addBob.res.status === 201 || addBob.res.ok) {
        pass("Manager adds Developer to regression project");
      } else fail("Manager adds Developer to regression project", addBob.text);
    }
  } else fail("POST /api/projects", create.text);

  const badName = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "Project 123!",
      organizationId,
    }),
  });
  if (badName.res.status === 400) {
    pass("POST /api/projects rejects non-alphabetical name");
  } else {
    fail("POST /api/projects rejects non-alphabetical name", `status ${badName.res.status}`);
  }

  const tooLong = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "A".repeat(101),
      organizationId,
    }),
  });
  if (tooLong.res.status === 400) {
    pass("POST /api/projects rejects name over 100 chars");
  } else {
    fail("POST /api/projects rejects name over 100 chars", `status ${tooLong.res.status}`);
  }

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

  // Manager project-create limit: fill to cap then expect 400
  const q = await api("/api/projects/quota");
  const limit = q.json?.limit;
  let used = q.json?.used ?? 0;
  const quotaProjIds = [];
  if (typeof limit === "number" && limit > 0 && organizationId) {
    // Raise org cap so personal MAX_PROJECTS_PER_MANAGER can be hit first
    await loginAs("superadmin@testbuddy.local");
    const raised = await api(`/api/organizations/${organizationId}`, {
      method: "PUT",
      body: JSON.stringify({ maxProjects: Math.max(limit + 20, 50) }),
    });
    if (!raised.res.ok) {
      fail("Manager fill toward project quota", `could not raise org limit: ${raised.text}`);
    }
    await loginAs("carol@testbuddy.local");

    while (used < limit) {
      const fill = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: uniqueProjectName("Quota Fill"),
          organizationId,
        }),
      });
      if (fill.res.status !== 201 || !fill.json?.id) {
        fail("Manager fill toward project quota", fill.text);
        break;
      }
      quotaProjIds.push(fill.json.id);
      used += 1;
    }
    if (quotaProjIds.length > 0 || used >= limit) {
      pass("Manager fill toward project quota", `filled to ${used}/${limit}`);
    }
    const blocked = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: uniqueProjectName("Quota Blocked"),
        organizationId,
      }),
    });
    if (blocked.res.status === 400 && /limit/i.test(blocked.text || "")) {
      pass("Manager cannot exceed project create limit");
    } else {
      fail("Manager cannot exceed project create limit", `status ${blocked.res.status} ${blocked.text}`);
    }
    for (const id of quotaProjIds) {
      await api(`/api/projects/${id}`, { method: "DELETE" });
    }
    const after = await api("/api/projects/quota");
    if (after.res.ok && (after.json?.remaining ?? 0) > 0) {
      pass("Manager quota frees after deleting projects");
    } else fail("Manager quota frees after deleting projects", after.text);
  } else {
    fail("Manager cannot exceed project create limit", "no quota limit");
  }
}

async function testOrgRbac() {
  // SuperAdmin creates org
  await loginAs("superadmin@testbuddy.local");
  const orgCreate = await api("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name: uniqueAlphaName("RegOrg") }),
  });
  let regOrgId = orgCreate.json?.id;
  if (orgCreate.res.status === 201 && regOrgId) {
    pass("POST /api/organizations (SuperAdmin)", orgCreate.json.name);
  } else fail("POST /api/organizations (SuperAdmin)", orgCreate.text);

  // Org project limit: SuperAdmin sets maxProjects; Manager cannot exceed
  const limitOrg = await api("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name: uniqueAlphaName("LimitOrg"), maxProjects: 2 }),
  });
  const limitOrgId = limitOrg.json?.id;
  if (
    limitOrg.res.status === 201 &&
    limitOrgId &&
    limitOrg.json?.maxProjects === 2
  ) {
    pass("POST /api/organizations with maxProjects=2", limitOrg.json.name);
  } else {
    fail("POST /api/organizations with maxProjects=2", limitOrg.text);
  }

  if (limitOrgId) {
    const bumpLimit = await api(`/api/organizations/${limitOrgId}`, {
      method: "PUT",
      body: JSON.stringify({ maxProjects: 1 }),
    });
    if (bumpLimit.res.ok && bumpLimit.json?.maxProjects === 1) {
      pass("PUT /api/organizations maxProjects=1");
    } else fail("PUT /api/organizations maxProjects=1", bumpLimit.text);

    const carolLoginForLimit = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "carol@testbuddy.local", password: "password" }),
    });
    const carolLimitId = carolLoginForLimit.json?.user?.id;
    if (carolLimitId) {
      await api(`/api/organizations/${limitOrgId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: carolLimitId }),
      });
    }

    await loginAs("carol@testbuddy.local");
    const firstInLimit = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: uniqueProjectName("LimOne"),
        organizationId: limitOrgId,
      }),
    });
    const firstLimId = firstInLimit.json?.id;
    if (firstInLimit.res.status === 201 && firstLimId) {
      pass("Manager creates first project under org limit");
    } else fail("Manager creates first project under org limit", firstInLimit.text);

    const secondBlocked = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: uniqueProjectName("LimTwo"),
        organizationId: limitOrgId,
      }),
    });
    if (
      secondBlocked.res.status === 400 &&
      /organization project limit/i.test(secondBlocked.text || "")
    ) {
      pass("Manager blocked by organization project limit");
    } else {
      fail(
        "Manager blocked by organization project limit",
        `status ${secondBlocked.res.status} ${secondBlocked.text}`,
      );
    }

    await loginAs("superadmin@testbuddy.local");
    const saBeyond = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: uniqueProjectName("SaBeyond"),
        organizationId: limitOrgId,
      }),
    });
    const saBeyondId = saBeyond.json?.id;
    if (saBeyond.res.status === 201 && saBeyondId) {
      pass("SuperAdmin can exceed organization project limit");
    } else fail("SuperAdmin can exceed organization project limit", saBeyond.text);

    const raiseLimit = await api(`/api/organizations/${limitOrgId}`, {
      method: "PUT",
      body: JSON.stringify({ maxProjects: 5 }),
    });
    if (raiseLimit.res.ok && raiseLimit.json?.maxProjects === 5) {
      pass("PUT /api/organizations raise maxProjects");
    } else fail("PUT /api/organizations raise maxProjects", raiseLimit.text);

    // Cleanup limit-org projects (org delete later via cascade if we delete org)
    for (const pid of [firstLimId, saBeyondId].filter(Boolean)) {
      await api(`/api/projects/${pid}`, { method: "DELETE" });
    }
    await api(`/api/organizations/${limitOrgId}`, { method: "DELETE" });
  }

  const badOrg = await api("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name: "Org 123!" }),
  });
  if (badOrg.res.status === 400) pass("POST /api/organizations rejects non-alphabetical name");
  else fail("POST /api/organizations rejects non-alphabetical name", `status ${badOrg.res.status}`);

  // Tester cannot create org
  await loginAs("alice@testbuddy.local");
  const testerOrg = await api("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name: "Nope Org" }),
  });
  if (testerOrg.res.status === 403) pass("Tester forbidden create organization");
  else fail("Tester forbidden create organization", `status ${testerOrg.res.status}`);

  // Tester cannot create project
  const testerProj = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Nope", organizationId: organizationId || regOrgId }),
  });
  if (testerProj.res.status === 403) pass("Tester forbidden create project");
  else fail("Tester forbidden create project", `status ${testerProj.res.status}`);

  // Developer cannot create project
  await loginAs("bob@testbuddy.local");
  const devProj = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Nope Dev", organizationId }),
  });
  if (devProj.res.status === 403) pass("Developer forbidden create project");
  else fail("Developer forbidden create project", `status ${devProj.res.status}`);

  // Manager can create project under org they belong to
  await loginAs("superadmin@testbuddy.local");
  const carolLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "carol@testbuddy.local", password: "password" }),
  });
  const carolId = carolLogin.json?.user?.id;
  if (regOrgId && carolId) {
    await api(`/api/organizations/${regOrgId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: carolId }),
    });
  }
  await loginAs("carol@testbuddy.local");
  const mgrProj = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProjectName("MgrProj"),
      organizationId: regOrgId || organizationId,
    }),
  });
  const mgrProjId = mgrProj.json?.id;
  if (mgrProj.res.status === 201 && mgrProjId) pass("Manager create project");
  else fail("Manager create project", mgrProj.text);

  // Manager outside the org cannot update/delete that project
  await loginAs("superadmin@testbuddy.local");
  const outsiderEmail = `outsider.${Date.now()}@testbuddy.local`;
  const outsider = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: "Outsider Manager",
      email: outsiderEmail,
      password: "password",
      role: "MANAGER",
    }),
  });
  if (outsider.res.status === 201 && outsider.json?.id) {
    pass("POST /api/users create outsider Manager");
    await loginAs(outsiderEmail);
    if (mgrProjId) {
      const stealUpdate = await api(`/api/projects/${mgrProjId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Stolen" }),
      });
      if (stealUpdate.res.status === 403) pass("Manager outside org forbidden update project");
      else fail("Manager outside org forbidden update project", `status ${stealUpdate.res.status}`);

      const stealDelete = await api(`/api/projects/${mgrProjId}`, { method: "DELETE" });
      if (stealDelete.res.status === 403) pass("Manager outside org forbidden delete project");
      else fail("Manager outside org forbidden delete project", `status ${stealDelete.res.status}`);
    }
    await loginAs("superadmin@testbuddy.local");
    await api(`/api/users/${outsider.json.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: false }),
    });
    await api(`/api/users/${outsider.json.id}/permanent`, { method: "DELETE" });
  } else {
    fail("POST /api/users create outsider Manager", outsider.text);
  }

  // Manager can manage org members
  await loginAs("carol@testbuddy.local");
  const bobLoginForOrg = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "bob@testbuddy.local", password: "password" }),
  });
  const bobOrgId = bobLoginForOrg.json?.user?.id;
  if (regOrgId && bobOrgId) {
    const mgrOrgAdd = await api(`/api/organizations/${regOrgId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobOrgId }),
    });
    if (mgrOrgAdd.res.status === 201 || mgrOrgAdd.res.ok) pass("Manager add org member");
    else fail("Manager add org member", mgrOrgAdd.text);
  } else {
    fail("Manager add org member", "missing org or bob id");
  }

  await loginAs("alice@testbuddy.local");
  if (regOrgId && bobOrgId) {
    const testerOrgAdd = await api(`/api/organizations/${regOrgId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobOrgId }),
    });
    if (testerOrgAdd.res.status === 403) pass("Tester forbidden add org member");
    else fail("Tester forbidden add org member", `status ${testerOrgAdd.res.status}`);
  }

  // Project visibility: second project in regOrg; Manager vs Dev/Tester scoping
  let secondProjId;
  await loginAs("superadmin@testbuddy.local");
  const secondProj = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProjectName("SecondProj"),
      organizationId: regOrgId,
    }),
  });
  secondProjId = secondProj.json?.id;
  if (secondProj.res.status === 201 && secondProjId) pass("POST second project in regOrg");
  else fail("POST second project in regOrg", secondProj.text);

  await loginAs("carol@testbuddy.local");
  const mgrOrgProjects = await api(`/api/projects?organizationId=${regOrgId}`);
  const mgrSeesBoth =
    Array.isArray(mgrOrgProjects.json) &&
    mgrOrgProjects.json.some((p) => p.id === mgrProjId) &&
    mgrOrgProjects.json.some((p) => p.id === secondProjId);
  if (mgrSeesBoth) pass("Manager sees all org projects");
  else fail("Manager sees all org projects", mgrOrgProjects.text);

  const mgrOrgDetail = await api(`/api/organizations/${regOrgId}`);
  const mgrOrgDetailCount = mgrOrgDetail.json?.projects?.length ?? 0;
  if (mgrOrgDetail.res.ok && mgrOrgDetailCount >= 2) pass("Manager org detail lists all projects");
  else fail("Manager org detail lists all projects", `count=${mgrOrgDetailCount}`);

  await loginAs("bob@testbuddy.local");
  const bobList = await api(`/api/projects?organizationId=${regOrgId}`);
  const bobSeesUnassigned =
    Array.isArray(bobList.json) && bobList.json.some((p) => p.id === mgrProjId);
  if (!bobSeesUnassigned) pass("Developer blocked from unassigned project list");
  else fail("Developer blocked from unassigned project list", bobList.text);

  const bobGetUnassigned = await api(`/api/projects/${mgrProjId}`);
  if (bobGetUnassigned.res.status === 403) pass("Developer forbidden get unassigned project");
  else fail("Developer forbidden get unassigned project", `status ${bobGetUnassigned.res.status}`);

  await loginAs("carol@testbuddy.local");
  const aliceLoginVis = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "alice@testbuddy.local", password: "password" }),
  });
  const aliceIdForVis = aliceLoginVis.json?.user?.id;
  if (aliceIdForVis && mgrProjId) {
    const badAdd = await api(`/api/projects/${mgrProjId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: aliceIdForVis }),
    });
    if (badAdd.res.status === 400) pass("addProjectMember rejects non-org user");
    else fail("addProjectMember rejects non-org user", `status ${badAdd.res.status} ${badAdd.text}`);

    await api(`/api/organizations/${regOrgId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: aliceIdForVis }),
    });
    await loginAs("alice@testbuddy.local");
    const aliceOrgDetail = await api(`/api/organizations/${regOrgId}`);
    const aliceOrgProjIds = (aliceOrgDetail.json?.projects ?? []).map((p) => p.id);
    if (
      aliceOrgDetail.res.ok &&
      !aliceOrgProjIds.includes(mgrProjId) &&
      !aliceOrgProjIds.includes(secondProjId)
    ) {
      pass("Tester org detail hides unassigned projects");
    } else fail("Tester org detail hides unassigned projects", JSON.stringify(aliceOrgProjIds));

    const aliceUnassigned = await api(`/api/projects?organizationId=${regOrgId}`);
    const aliceSeesMgr =
      Array.isArray(aliceUnassigned.json) && aliceUnassigned.json.some((p) => p.id === mgrProjId);
    if (!aliceSeesMgr) pass("Tester blocked from unassigned project list");
    else fail("Tester blocked from unassigned project list", aliceUnassigned.text);
  } else {
    fail("addProjectMember rejects non-org user", "missing alice or mgrProjId");
    fail("Tester org detail hides unassigned projects", "missing alice or mgrProjId");
    fail("Tester blocked from unassigned project list", "missing alice or mgrProjId");
  }

  if (regOrgId && bobOrgId && mgrProjId) {
    await loginAs("carol@testbuddy.local");
    await api(`/api/projects/${mgrProjId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobOrgId }),
    });
    await loginAs("bob@testbuddy.local");
    const bobBeforeRemove = await api(`/api/projects/${mgrProjId}`);
    if (bobBeforeRemove.res.ok) pass("Developer has project access before org removal");
    else fail("Developer has project access before org removal", bobBeforeRemove.text);

    await loginAs("carol@testbuddy.local");
    await api(`/api/organizations/${regOrgId}/members/${bobOrgId}`, { method: "DELETE" });
    await loginAs("bob@testbuddy.local");
    const bobAfterRemove = await api(`/api/projects/${mgrProjId}`);
    if (bobAfterRemove.res.status === 403) pass("Org removal revokes project access");
    else fail("Org removal revokes project access", `status ${bobAfterRemove.res.status}`);

    await loginAs("carol@testbuddy.local");
    await api(`/api/organizations/${regOrgId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobOrgId }),
    });
  } else {
    fail("Org removal revokes project access", "missing org, bob, or mgrProjId");
  }

  await loginAs("alice@testbuddy.local");
  const aliceMe = await api("/api/auth/me");
  if (mgrProjId) {
    const stealGet = await api(`/api/projects/${mgrProjId}`);
    if (stealGet.res.status === 403) pass("Tester forbidden get foreign project");
    else fail("Tester forbidden get foreign project", `status ${stealGet.res.status}`);

    const stealCycles = await api(`/api/cycles?projectId=${mgrProjId}`);
    if (stealCycles.res.status === 403) pass("Tester forbidden list foreign cycles");
    else fail("Tester forbidden list foreign cycles", `status ${stealCycles.res.status}`);

    const stealMembers = await api(`/api/projects/${mgrProjId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: aliceMe.json?.id }),
    });
    if (stealMembers.res.status === 403) pass("Tester forbidden self-join foreign project");
    else fail("Tester forbidden self-join foreign project", `status ${stealMembers.res.status}`);

    const stealMods = await api(`/api/projects/${mgrProjId}/modules`, {
      method: "POST",
      body: JSON.stringify({ name: "Hijack" }),
    });
    if (stealMods.res.status === 403) pass("Tester forbidden module on foreign project");
    else fail("Tester forbidden module on foreign project", `status ${stealMods.res.status}`);

    const stealBug = await api("/api/bugs", {
      method: "POST",
      body: JSON.stringify({
        title: "Should fail",
        description: "No access",
        priority: "LOW",
        severity: "MINOR",
        assigneeId: aliceMe.json?.id || assigneeId,
        cycleId: crypto.randomUUID(),
        projectId: mgrProjId,
        status: "NEW",
        steps: [],
      }),
    });
    if (stealBug.res.status === 403) pass("Tester forbidden create bug outside access");
    else fail("Tester forbidden create bug outside access", `status ${stealBug.res.status} ${stealBug.text}`);

    const stealList = await api(`/api/bugs?projectId=${mgrProjId}`);
    if (stealList.res.status === 403) pass("Tester forbidden list bugs for foreign project");
    else fail("Tester forbidden list bugs for foreign project", `status ${stealList.res.status}`);
  }

  // Tester creates module
  await loginAs("alice@testbuddy.local");
  const targetProject = createdProjectId || projectId;
  const mod = await api(`/api/projects/${targetProject}/modules`, {
    method: "POST",
    body: JSON.stringify({ name: `Mod ${Date.now()}` }),
  });
  if (mod.res.status === 201 && mod.json?.id) {
    moduleId = mod.json.id;
    pass("Tester create module", mod.json.name);
  } else fail("Tester create module", mod.text);

  // Developer cannot create module
  await loginAs("bob@testbuddy.local");
  const badMod = await api(`/api/projects/${targetProject}/modules`, {
    method: "POST",
    body: JSON.stringify({ name: "DevMod" }),
  });
  if (badMod.res.status === 403) pass("Developer forbidden create module");
  else fail("Developer forbidden create module", `status ${badMod.res.status}`);

  // SuperAdmin cannot create module (Manager | Tester only)
  await loginAs("superadmin@testbuddy.local");
  const saMod = await api(`/api/projects/${targetProject}/modules`, {
    method: "POST",
    body: JSON.stringify({ name: "SaMod" }),
  });
  if (saMod.res.status === 403) pass("SuperAdmin forbidden create module");
  else fail("SuperAdmin forbidden create module", `status ${saMod.res.status}`);

  // Manager assigns Tester → Tester sees project (+ modules)
  if (mgrProjId) {
    await loginAs("carol@testbuddy.local");
    const mgrAdd = await api(`/api/projects/${mgrProjId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: aliceMe.json?.id }),
    });
    if (mgrAdd.res.status === 201 || mgrAdd.res.ok) pass("Manager add Tester as project member");
    else fail("Manager add Tester as project member", mgrAdd.text);

    await loginAs("alice@testbuddy.local");
    const aliceProjects = await api("/api/projects");
    const seesMgr =
      Array.isArray(aliceProjects.json) && aliceProjects.json.some((p) => p.id === mgrProjId);
    if (seesMgr) pass("Tester sees Manager-assigned project");
    else fail("Tester sees Manager-assigned project", aliceProjects.text);

    const aliceMods = await api(`/api/projects/${mgrProjId}/modules`);
    if (aliceMods.res.ok) pass("Tester can list modules on assigned project");
    else fail("Tester can list modules on assigned project", aliceMods.text);

    // Manager can also add Developer as member
    await loginAs("carol@testbuddy.local");
    const bobLogin = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "bob@testbuddy.local", password: "password" }),
    });
    const bobUserId = bobLogin.json?.user?.id;
    if (bobUserId) {
      const mgrAddBob = await api(`/api/projects/${mgrProjId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: bobUserId }),
      });
      if (mgrAddBob.res.status === 201 || mgrAddBob.res.ok) pass("Manager add project member");
      else fail("Manager add project member", mgrAddBob.text);
    } else {
      fail("Manager add project member", "no bob user");
    }
  } else {
    fail("Manager add Tester as project member", "no mgrProjId");
  }

  // Cleanup manager project + org (SuperAdmin can manage any project)
  await loginAs("superadmin@testbuddy.local");
  if (secondProjId) {
    await api(`/api/projects/${secondProjId}`, { method: "DELETE" });
  }
  if (mgrProjId) {
    await api(`/api/projects/${mgrProjId}`, { method: "DELETE" });
  }
  if (regOrgId) {
    const delOrg = await api(`/api/organizations/${regOrgId}`, { method: "DELETE" });
    if (delOrg.res.status === 204) pass("DELETE /api/organizations cleanup");
    else fail("DELETE /api/organizations cleanup", `status ${delOrg.res.status}`);
  }
}

async function testRoleTransfer() {
  await loginAs("alice@testbuddy.local");
  const aliceMe = await api("/api/auth/me");
  const aliceId = aliceMe.json?.id;

  const testerAdmin = await api("/api/users/admin");
  if (testerAdmin.res.status === 403) pass("Tester forbidden users admin list");
  else fail("Tester forbidden users admin list", `status ${testerAdmin.res.status}`);

  await loginAs("bob@testbuddy.local");
  const devRole = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "DEVELOPER" }),
  });
  if (devRole.res.status === 403) pass("Developer forbidden role transfer");
  else fail("Developer forbidden role transfer", `status ${devRole.res.status}`);

  await loginAs("carol@testbuddy.local");
  const toDev = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "DEVELOPER" }),
  });
  if (toDev.res.ok && toDev.json?.role === "DEVELOPER") pass("Manager role transfer → Developer");
  else fail("Manager role transfer → Developer", toDev.text);

  const toTester = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "TESTER" }),
  });
  if (toTester.res.ok && toTester.json?.role === "TESTER") pass("Manager role transfer → Tester");
  else fail("Manager role transfer → Tester", toTester.text);

  const promote = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "MANAGER" }),
  });
  if (promote.res.ok && promote.json?.role === "MANAGER") pass("Manager role transfer → Manager");
  else fail("Manager role transfer → Manager", promote.text);

  const restoreTester = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "TESTER", name: "Alice Tester" }),
  });
  if (restoreTester.res.ok && restoreTester.json?.role === "TESTER") {
    pass("Manager restore Tester after promote");
  } else fail("Manager restore Tester after promote", restoreTester.text);

  const nameEdit = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ name: "Alice Tester Updated" }),
  });
  if (nameEdit.res.ok && nameEdit.json?.name === "Alice Tester Updated") {
    pass("Manager full user update");
  } else fail("Manager full user update", nameEdit.text);

  await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ name: "Alice Tester" }),
  });

  const toSA = await api(`/api/users/${aliceId}`, {
    method: "PUT",
    body: JSON.stringify({ role: "SUPERADMIN" }),
  });
  if (toSA.res.status === 403) pass("Manager cannot assign SUPERADMIN");
  else fail("Manager cannot assign SUPERADMIN", `status ${toSA.res.status}`);

  // Reset password RBAC
  const mgrResetTester = await api(`/api/users/${aliceId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword: "password" }),
  });
  if (mgrResetTester.res.ok) pass("Manager reset Tester password");
  else fail("Manager reset Tester password", mgrResetTester.text);

  const saLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "superadmin@testbuddy.local", password: "password" }),
  });
  const saId = saLogin.json?.user?.id;
  if (saId) {
    const mgrResetSA = await api(`/api/users/${saId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword: "password123" }),
    });
    if (mgrResetSA.res.status === 403) pass("Manager forbidden reset SuperAdmin password");
    else fail("Manager forbidden reset SuperAdmin password", `status ${mgrResetSA.res.status}`);
  } else {
    fail("Manager forbidden reset SuperAdmin password", "no superadmin id");
  }

  const peerEmail = `peer.mgr.${Date.now()}@testbuddy.local`;
  const peer = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: "Peer Manager",
      email: peerEmail,
      password: "password",
      role: "MANAGER",
    }),
  });
  if (peer.res.status === 201 && peer.json?.id) {
    const mgrResetPeer = await api(`/api/users/${peer.json.id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword: "password" }),
    });
    if (mgrResetPeer.res.ok) pass("Manager reset peer Manager password");
    else fail("Manager reset peer Manager password", mgrResetPeer.text);
    await loginAs("superadmin@testbuddy.local");
    await api(`/api/users/${peer.json.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: false }),
    });
    await api(`/api/users/${peer.json.id}/permanent`, { method: "DELETE" });
    await loginAs("carol@testbuddy.local");
  } else {
    fail("Manager reset peer Manager password", peer.text);
  }

  const carolLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "carol@testbuddy.local", password: "password" }),
  });
  const carolId = carolLogin.json?.user?.id;

  await loginAs("alice@testbuddy.local");
  if (carolId) {
    const testerReset = await api(`/api/users/${carolId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword: "password123" }),
    });
    if (testerReset.res.status === 403) pass("Tester forbidden reset password");
    else fail("Tester forbidden reset password", `status ${testerReset.res.status}`);
  } else {
    fail("Tester forbidden reset password", "no carol id");
  }

  const selfPw = await api("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify({
      name: "Alice Tester",
      currentPassword: "password",
      newPassword: "password",
    }),
  });
  if (selfPw.res.ok) pass("Tester change own password via profile");
  else fail("Tester change own password via profile", selfPw.text);
}

async function testBugs() {
  await loginAs("alice@testbuddy.local");

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
    moduleId: moduleId || undefined,
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
    pass("POST /api/bugs (Tester)", `id=${bugId} screenshots=1`);
  } else fail("POST /api/bugs (Tester)", create.text);

  // Developer cannot create bug
  await loginAs("bob@testbuddy.local");
  const devCreate = await api("/api/bugs", {
    method: "POST",
    body: JSON.stringify({ ...body, title: "Dev should fail" }),
  });
  if (devCreate.res.status === 403) pass("Developer forbidden create bug");
  else fail("Developer forbidden create bug", `status ${devCreate.res.status}`);

  // Developer status-only update + comment
  const statusOnly = await api(`/api/bugs/${bugId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  if (statusOnly.res.ok && statusOnly.json?.status === "IN_PROGRESS") {
    pass("Developer PUT status only");
  } else fail("Developer PUT status only", statusOnly.text);

  const fullDenied = await api(`/api/bugs/${bugId}`, {
    method: "PUT",
    body: JSON.stringify({ ...body, title: "Hacked", status: "FIXED" }),
  });
  if (fullDenied.res.status === 403) pass("Developer forbidden full bug update");
  else fail("Developer forbidden full bug update", `status ${fullDenied.res.status}`);

  const comment = await api(`/api/bugs/${bugId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "Looking into this" }),
  });
  if (comment.res.status === 201 && comment.json?.body) pass("Developer post comment");
  else fail("Developer post comment", comment.text);

  const comments = await api(`/api/bugs/${bugId}/comments`);
  if (comments.res.ok && comments.json?.length >= 1) pass("GET bug comments");
  else fail("GET bug comments", comments.text);

  // Tester can comment + status + full field edit (not delete)
  await loginAs("alice@testbuddy.local");
  const testerComment = await api(`/api/bugs/${bugId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "Reproduced on staging" }),
  });
  if (testerComment.res.status === 201) pass("Tester post comment");
  else fail("Tester post comment", testerComment.text);

  const testerStatus = await api(`/api/bugs/${bugId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "OPEN" }),
  });
  if (testerStatus.res.ok && testerStatus.json?.status === "OPEN") {
    pass("Tester PUT status only");
  } else fail("Tester PUT status only", testerStatus.text);

  const testerUpdate = await api(`/api/bugs/${bugId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...body,
      title: "Tester edit",
      description: "Updated by tester",
      priority: "HIGH",
      severity: "CRITICAL",
      status: "OPEN",
    }),
  });
  if (
    testerUpdate.res.ok &&
    testerUpdate.json?.title === "Tester edit" &&
    testerUpdate.json?.priority === "HIGH" &&
    testerUpdate.json?.severity === "CRITICAL"
  ) {
    pass("Tester full bug update");
  } else fail("Tester full bug update", testerUpdate.text);

  const testerDelete = await api(`/api/bugs/${bugId}`, { method: "DELETE" });
  if (testerDelete.res.status === 403) pass("Tester forbidden delete bug");
  else fail("Tester forbidden delete bug", `status ${testerDelete.res.status}`);

  // Project members: SuperAdmin + Manager only
  const usersList = await api("/api/users");
  const bobId = usersList.json?.find((u) => u.role === "DEVELOPER")?.id;
  if (bobId) {
    await api(`/api/projects/${createdProjectId}/members/${bobId}`, { method: "DELETE" });
    const addMem = await api(`/api/projects/${createdProjectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobId }),
    });
    if (addMem.res.status === 403) pass("Tester forbidden add project member");
    else fail("Tester forbidden add project member", `status ${addMem.res.status}`);
  } else {
    fail("Tester forbidden add project member", "no developer user found");
  }

  await loginAs("bob@testbuddy.local");
  if (bobId) {
    const devAdd = await api(`/api/projects/${createdProjectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobId }),
    });
    if (devAdd.res.status === 403) pass("Developer forbidden add project member");
    else fail("Developer forbidden add project member", `status ${devAdd.res.status}`);
  } else {
    fail("Developer forbidden add project member", "no developer user found");
  }

  await loginAs("carol@testbuddy.local");
  if (bobId) {
    const mgrAdd = await api(`/api/projects/${createdProjectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: bobId }),
    });
    if (mgrAdd.res.status === 201 || mgrAdd.res.ok) pass("Manager add project member (demo project)");
    else fail("Manager add project member (demo project)", mgrAdd.text);
  }

  // Manager full update
  await loginAs("carol@testbuddy.local");
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
  if (update.res.ok && update.json?.status === "OPEN") pass("PUT /api/bugs/:id (Manager)");
  else fail("PUT /api/bugs/:id (Manager)", update.text);

  const exportAll = await api("/api/bugs/export/json");
  if (exportAll.res.ok && exportAll.json?.bugs?.length >= 1) {
    pass("GET /api/bugs/export/json", `count=${exportAll.json.count}`);
  } else fail("GET /api/bugs/export/json", exportAll.text);

  const exportOne = await api(`/api/bugs/${bugId}/export/json`);
  if (exportOne.res.ok && exportOne.json?.count === 1) pass("GET /api/bugs/:id/export/json");
  else fail("GET /api/bugs/:id/export/json", exportOne.text);

  await loginAs("alice@testbuddy.local");
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

  if (moduleId) {
    const byMod = await api(`/api/bugs?projectId=${createdProjectId}&moduleId=${moduleId}`);
    if (byMod.res.ok && Array.isArray(byMod.json) && byMod.json.some((b) => b.id === bugId)) {
      pass("GET /api/bugs moduleId filter");
    } else fail("GET /api/bugs moduleId filter", byMod.text);
  } else {
    fail("GET /api/bugs moduleId filter", "no moduleId from setup");
  }

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
  await loginAs("carol@testbuddy.local");

  if (bugId) {
    const delBug = await api(`/api/bugs/${bugId}`, { method: "DELETE" });
    if (delBug.res.status === 204) pass("DELETE /api/bugs/:id");
    else fail("DELETE /api/bugs/:id", `status ${delBug.res.status}`);
    const gone = await api(`/api/bugs/${bugId}`);
    if (gone.res.status === 404) pass("Deleted bug returns 404");
    else fail("Deleted bug returns 404", `status ${gone.res.status}`);
  }

  const withBugs = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProjectName("Cascade Project"),
      organizationId,
    }),
  });
  const cascadeId = withBugs.json?.id;
  if (cascadeId) {
    const cycles = await api(`/api/cycles?projectId=${cascadeId}`);
    const cId = cycles.json?.[0]?.id;
    const users = await api("/api/users");
    const aId = users.json?.[0]?.id;
    if (cId && aId) {
      await loginAs("alice@testbuddy.local");
      await api("/api/bugs", {
        method: "POST",
        body: JSON.stringify({
          title: "Cascade delete me",
          description: "temp",
          priority: "MEDIUM",
          severity: "MINOR",
          assigneeId: aId,
          cycleId: cId,
          projectId: cascadeId,
          status: "NEW",
          steps: [],
        }),
      });
      await loginAs("carol@testbuddy.local");
    }
    const delCascade = await api(`/api/projects/${cascadeId}`, { method: "DELETE" });
    if (delCascade.res.status === 204) pass("DELETE /api/projects cascades bugs");
    else fail("DELETE /api/projects cascades bugs", `status ${delCascade.res.status}`);
  }

  const empty = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: uniqueProjectName("Empty Project"),
      organizationId,
    }),
  });
  const emptyId = empty.json?.id;
  if (emptyId) {
    const del = await api(`/api/projects/${emptyId}`, { method: "DELETE" });
    if (del.res.status === 204) pass("DELETE /api/projects empty");
    else fail("DELETE /api/projects empty", `status ${del.res.status}`);
  }

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

  const popupJs = fs.readFileSync(path.join(distPath, "popup.js"), "utf8");
  const chunksDir = path.join(distPath, "chunks");
  let chunkJs = "";
  if (fs.existsSync(chunksDir)) {
    for (const f of fs.readdirSync(chunksDir).filter((n) => n.endsWith(".js"))) {
      chunkJs += fs.readFileSync(path.join(chunksDir, f), "utf8");
    }
  }
  const popupBundle = popupJs + chunkJs;
  if (
    popupBundle.includes("fetchModules") ||
    popupBundle.includes("/modules") ||
    (popupJs.includes("moduleId") && popupJs.includes("Module"))
  ) {
    pass("extension popup modules support");
  } else fail("extension popup modules support", "modules fetch not found");

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
    await testOrgRbac();
    await testRoleTransfer();
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
