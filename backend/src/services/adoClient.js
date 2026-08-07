/**
 * Azure DevOps REST helpers (server-side only).
 * Auth: Basic with empty username + PAT (per ADO docs).
 */

function basicAuth(pat) {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

/** Parse org name from https://dev.azure.com/{org} or https://{org}.visualstudio.com */
export function parseAdoOrg(orgUrl) {
  const raw = String(orgUrl || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Azure DevOps org URL is required");
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.hostname === "dev.azure.com") {
      const org = u.pathname.split("/").filter(Boolean)[0];
      if (!org) throw new Error("Org name missing in Azure DevOps URL");
      return { host: "https://dev.azure.com", org };
    }
    if (u.hostname.endsWith(".visualstudio.com")) {
      const org = u.hostname.split(".")[0];
      return { host: `https://${org}.visualstudio.com`, org };
    }
  } catch (err) {
    if (err.message.includes("Org name") || err.message.includes("required")) throw err;
  }
  throw new Error("Unrecognized Azure DevOps org URL — use https://dev.azure.com/{org}");
}

async function adoFetch(url, pat, { method = "GET", body, contentType } = {}) {
  const headers = {
    Authorization: basicAuth(pat),
    Accept: "application/json",
  };
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(url, {
    method,
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      json?.message ||
      json?.value?.Message ||
      text?.slice(0, 300) ||
      `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

function witBase(host, org, project) {
  return `${host}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit`;
}

/**
 * List team iterations. If team omitted, uses the default project team.
 */
export async function listAdoIterations({ orgUrl, project, team, pat }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  if (!projectName) throw new Error("Azure DevOps project name is required");
  if (!pat) throw new Error("Azure DevOps PAT is required");

  let teamName = String(team || "").trim();
  if (!teamName) {
    const teamsUrl = `${host}/${encodeURIComponent(org)}/_apis/projects/${encodeURIComponent(projectName)}/teams?$top=1&api-version=7.1`;
    const teams = await adoFetch(teamsUrl, pat);
    teamName = teams?.value?.[0]?.name;
    if (!teamName) throw new Error("No Azure DevOps team found for this project");
  }

  const iterUrl =
    `${host}/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/` +
    `${encodeURIComponent(teamName)}/_apis/work/teamsettings/iterations?api-version=7.1`;
  const data = await adoFetch(iterUrl, pat);
  const rows = Array.isArray(data?.value) ? data.value : [];
  return rows.map((it) => ({
    id: it.id,
    name: it.name,
    path: it.path,
    startDate: it.attributes?.startDate ?? null,
    finishDate: it.attributes?.finishDate ?? null,
    timeFrame: it.attributes?.timeFrame ?? null,
    team: teamName,
  }));
}

export async function testAdoConnection({ orgUrl, project, team, pat }) {
  const iterations = await listAdoIterations({ orgUrl, project, team, pat });
  return {
    ok: true,
    iterationCount: iterations.length,
    team: iterations[0]?.team || team || null,
  };
}

/** Create a Bug work item via JSON Patch. */
export async function createAdoWorkItem({ orgUrl, project, pat, patchOperations }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url = `${witBase(host, org, projectName)}/workitems/$Bug?api-version=7.1`;
  return adoFetch(url, pat, {
    method: "POST",
    contentType: "application/json-patch+json",
    body: JSON.stringify(patchOperations),
  });
}

/** Update an existing work item via JSON Patch. */
export async function updateAdoWorkItem({ orgUrl, project, pat, workItemId, patchOperations }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url = `${witBase(host, org, projectName)}/workitems/${encodeURIComponent(workItemId)}?api-version=7.1`;
  return adoFetch(url, pat, {
    method: "PATCH",
    contentType: "application/json-patch+json",
    body: JSON.stringify(patchOperations),
  });
}

export async function getAdoWorkItem({ orgUrl, project, pat, workItemId }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url =
    `${witBase(host, org, projectName)}/workitems/${encodeURIComponent(workItemId)}` +
    `?$expand=relations&api-version=7.1`;
  return adoFetch(url, pat);
}

export async function listAdoComments({ orgUrl, project, pat, workItemId }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url =
    `${witBase(host, org, projectName)}/workItems/${encodeURIComponent(workItemId)}` +
    `/comments?api-version=7.1-preview.4`;
  const data = await adoFetch(url, pat);
  return Array.isArray(data?.comments) ? data.comments : Array.isArray(data?.value) ? data.value : [];
}

export async function addAdoComment({ orgUrl, project, pat, workItemId, text }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url =
    `${witBase(host, org, projectName)}/workItems/${encodeURIComponent(workItemId)}` +
    `/comments?api-version=7.1-preview.4`;
  return adoFetch(url, pat, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({ text: String(text) }),
  });
}

/** Upload binary attachment; returns { id, url }. */
export async function uploadAdoAttachment({ orgUrl, project, pat, fileName, buffer, contentType }) {
  const { host, org } = parseAdoOrg(orgUrl);
  const projectName = String(project || "").trim();
  const url =
    `${witBase(host, org, projectName)}/attachments` +
    `?fileName=${encodeURIComponent(fileName)}&api-version=7.1`;
  return adoFetch(url, pat, {
    method: "POST",
    contentType: contentType || "application/octet-stream",
    body: buffer,
  });
}

export function workItemWebUrl({ orgUrl, project, workItemId }) {
  try {
    const { host, org } = parseAdoOrg(orgUrl);
    return `${host}/${org}/${encodeURIComponent(project)}/_workitems/edit/${workItemId}`;
  } catch {
    return null;
  }
}

export function mapTbPriorityToAdo(priority) {
  switch (String(priority || "").toUpperCase()) {
    case "CRITICAL":
      return 1;
    case "HIGH":
      return 2;
    case "LOW":
      return 4;
    default:
      return 3;
  }
}

export function mapTbSeverityToAdo(severity) {
  switch (String(severity || "").toUpperCase()) {
    case "BLOCKER":
      return "1 - Critical";
    case "CRITICAL":
      return "2 - High";
    case "MINOR":
      return "4 - Low";
    default:
      return "3 - Medium";
  }
}

export function mapTbStatusToAdoState(status) {
  switch (String(status || "").toUpperCase()) {
    case "NEW":
      return "New";
    case "OPEN":
    case "IN_PROGRESS":
    case "REOPENED":
      return "Active";
    case "FIXED":
      return "Resolved";
    case "VERIFIED":
    case "CLOSED":
      return "Closed";
    default:
      return "New";
  }
}

export function mapAdoStateToTbStatus(state) {
  const s = String(state || "").toLowerCase();
  if (s.includes("new") || s.includes("proposed") || s.includes("to do")) return "NEW";
  if (s.includes("resolve") || s.includes("done")) return "FIXED";
  if (s.includes("close") || s.includes("removed")) return "CLOSED";
  if (s.includes("active") || s.includes("progress") || s.includes("committed")) return "IN_PROGRESS";
  return "OPEN";
}
