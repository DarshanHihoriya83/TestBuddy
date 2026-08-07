import { query } from "../db.js";
import { badRequest, forbidden } from "../errors.js";
import { decryptSecret } from "../cryptoSecrets.js";
import { canCreateBug, canFullEditBug, canUpdateBugStatus, isSuperAdmin } from "../roles.js";
import { readScreenshotFile } from "./screenshotStorage.js";
import {
  addAdoComment,
  createAdoWorkItem,
  getAdoWorkItem,
  listAdoComments,
  mapAdoStateToTbStatus,
  mapTbPriorityToAdo,
  mapTbSeverityToAdo,
  mapTbStatusToAdoState,
  updateAdoWorkItem,
  uploadAdoAttachment,
  workItemWebUrl,
} from "./adoClient.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReproHtml(bug) {
  const parts = [];
  parts.push(`<p><b>Description</b></p><p>${escapeHtml(bug.description).replace(/\n/g, "<br/>")}</p>`);
  if (bug.environmentName || bug.environmentSnapshot) {
    parts.push(
      `<p><b>Environment</b></p><p>${escapeHtml(
        [bug.environmentName, bug.environmentSnapshot].filter(Boolean).join(" · "),
      )}</p>`,
    );
  }
  if (bug.steps?.length) {
    parts.push("<p><b>Steps</b></p><ol>");
    for (const step of bug.steps) {
      parts.push("<li>");
      parts.push(`<div><b>Step:</b> ${escapeHtml(step.description)}</div>`);
      if (step.actualResult) {
        parts.push(`<div><b>Actual:</b> ${escapeHtml(step.actualResult)}</div>`);
      }
      if (step.expectedResult) {
        parts.push(`<div><b>Expected:</b> ${escapeHtml(step.expectedResult)}</div>`);
      }
      parts.push("</li>");
    }
    parts.push("</ol>");
  }
  parts.push(
    `<p><i>Synced from TestBuddy bug ${escapeHtml(bug.id)}</i></p>`,
  );
  return parts.join("");
}

function buildTags(bug) {
  const tags = ["TestBuddy"];
  if (bug.priority) tags.push(`priority:${bug.priority}`);
  if (bug.severity) tags.push(`severity:${bug.severity}`);
  if (bug.environmentName) tags.push(`env:${bug.environmentName}`);
  return tags.join("; ");
}

async function loadProjectAdoCreds(projectId) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
  const project = rows[0];
  if (!project) throw badRequest("Project not found");
  if (!project.ado_org_url || !project.ado_project) {
    throw badRequest("Configure Azure DevOps org URL and project on this TestBuddy project first");
  }
  if (!project.ado_pat_encrypted) {
    throw badRequest("Save an Azure DevOps PAT on this project first");
  }
  return {
    project,
    orgUrl: project.ado_org_url,
    adoProject: project.ado_project,
    pat: decryptSecret(project.ado_pat_encrypted),
  };
}

async function loadSprintPath(sprintId) {
  if (!sprintId) return null;
  const { rows } = await query(
    `SELECT ado_iteration_path, name FROM cycles WHERE id = $1`,
    [sprintId],
  );
  return rows[0]?.ado_iteration_path || null;
}

function fieldPatch(path, value) {
  return { op: "add", path, value };
}

function buildCreatePatch(bug, iterationPath, { includeSeverity = true } = {}) {
  const ops = [
    fieldPatch("/fields/System.Title", bug.title),
    fieldPatch("/fields/Microsoft.VSTS.TCM.ReproSteps", buildReproHtml(bug)),
    fieldPatch("/fields/System.Description", bug.description || bug.title),
    fieldPatch("/fields/Microsoft.VSTS.Common.Priority", mapTbPriorityToAdo(bug.priority)),
    fieldPatch("/fields/System.Tags", buildTags(bug)),
  ];
  if (includeSeverity) {
    ops.push(
      fieldPatch("/fields/Microsoft.VSTS.Common.Severity", mapTbSeverityToAdo(bug.severity)),
    );
  }
  if (iterationPath) {
    ops.push(fieldPatch("/fields/System.IterationPath", iterationPath));
  }
  return ops;
}

function buildUpdatePatch(bug, iterationPath, { includeSeverity = true } = {}) {
  const ops = [
    { op: "replace", path: "/fields/System.Title", value: bug.title },
    {
      op: "replace",
      path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
      value: buildReproHtml(bug),
    },
    { op: "replace", path: "/fields/System.Description", value: bug.description || bug.title },
    {
      op: "replace",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: mapTbPriorityToAdo(bug.priority),
    },
    { op: "replace", path: "/fields/System.Tags", value: buildTags(bug) },
    {
      op: "add",
      path: "/fields/System.State",
      value: mapTbStatusToAdoState(bug.status),
    },
  ];
  if (includeSeverity) {
    ops.push({
      op: "replace",
      path: "/fields/Microsoft.VSTS.Common.Severity",
      value: mapTbSeverityToAdo(bug.severity),
    });
  }
  if (iterationPath) {
    ops.push({
      op: "add",
      path: "/fields/System.IterationPath",
      value: iterationPath,
    });
  }
  return ops;
}

async function attachScreenshots({ orgUrl, adoProject, pat, workItemId, bug }) {
  const shots = bug.screenshots || [];
  if (!shots.length) return { attached: 0 };

  const { rows } = await query(
    `SELECT id, storage_path, content_type, overview FROM screenshots WHERE bug_id = $1`,
    [bug.id],
  );
  let attached = 0;
  const relationOps = [];
  for (const row of rows) {
    try {
      const buffer = await readScreenshotFile(row.storage_path);
      const ext = (row.content_type || "").includes("png")
        ? "png"
        : (row.content_type || "").includes("jpeg")
          ? "jpg"
          : "bin";
      const fileName = `testbuddy-${row.id}.${ext}`;
      const uploaded = await uploadAdoAttachment({
        orgUrl,
        project: adoProject,
        pat,
        fileName,
        buffer,
        contentType: row.content_type || "application/octet-stream",
      });
      if (uploaded?.url) {
        relationOps.push({
          op: "add",
          path: "/relations/-",
          value: {
            rel: "AttachedFile",
            url: uploaded.url,
            attributes: {
              comment: row.overview || "TestBuddy screenshot",
            },
          },
        });
        attached += 1;
      }
    } catch {
      /* keep going — attachment failures should not block the work item */
    }
  }
  if (relationOps.length) {
    await updateAdoWorkItem({
      orgUrl,
      project: adoProject,
      pat,
      workItemId,
      patchOperations: relationOps,
    });
  }
  return { attached };
}

async function pushCommentsToAdo({ orgUrl, adoProject, pat, workItemId, bugId }) {
  const { rows } = await query(
    `SELECT c.*, u.name AS author_name
     FROM bug_comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.bug_id = $1 AND (c.ado_comment_id IS NULL OR c.ado_comment_id = '')
     ORDER BY c.created_at ASC`,
    [bugId],
  );
  let pushed = 0;
  for (const row of rows) {
    const text = `[TestBuddy — ${row.author_name || "user"}]\n${row.body}`;
    try {
      const created = await addAdoComment({
        orgUrl,
        project: adoProject,
        pat,
        workItemId,
        text,
      });
      const adoId = created?.id != null ? String(created.id) : null;
      if (adoId) {
        await query(`UPDATE bug_comments SET ado_comment_id = $1 WHERE id = $2`, [
          adoId,
          row.id,
        ]);
        pushed += 1;
      }
    } catch {
      /* skip failed comment */
    }
  }
  return { pushed };
}

/**
 * Push (create or update) a TestBuddy bug to Azure DevOps.
 * Includes fields, steps (ReproSteps HTML), screenshots, and comments.
 */
export async function pushBugToAdo(actor, bugId, { getBug, assertCanAccessBug }) {
  if (!canCreateBug(actor) && !canFullEditBug(actor) && !isSuperAdmin(actor)) {
    throw forbidden("You cannot push bugs to Azure DevOps");
  }
  await assertCanAccessBug(actor, bugId);
  const bug = await getBug(actor, bugId);
  const { orgUrl, adoProject, pat } = await loadProjectAdoCreds(bug.projectId);
  const iterationPath = await loadSprintPath(bug.sprintId);

  let workItemId = bug.externalRefs?.adoWorkItemId || null;
  let workItem;
  let created = false;

  if (workItemId) {
    try {
      workItem = await updateAdoWorkItem({
        orgUrl,
        project: adoProject,
        pat,
        workItemId,
        patchOperations: buildUpdatePatch(bug, iterationPath),
      });
    } catch (err) {
      if (err.status === 404) {
        workItem = await createAdoWorkItem({
          orgUrl,
          project: adoProject,
          pat,
          patchOperations: buildCreatePatch(bug, iterationPath),
        });
        workItemId = String(workItem.id);
        created = true;
      } else {
        // Retry without Severity (some processes lack the field)
        try {
          workItem = await updateAdoWorkItem({
            orgUrl,
            project: adoProject,
            pat,
            workItemId,
            patchOperations: buildUpdatePatch(bug, iterationPath, { includeSeverity: false }),
          });
        } catch (err2) {
          throw err2;
        }
      }
    }
  } else {
    try {
      workItem = await createAdoWorkItem({
        orgUrl,
        project: adoProject,
        pat,
        patchOperations: buildCreatePatch(bug, iterationPath),
      });
    } catch {
      workItem = await createAdoWorkItem({
        orgUrl,
        project: adoProject,
        pat,
        patchOperations: buildCreatePatch(bug, iterationPath, { includeSeverity: false }),
      });
    }
    workItemId = String(workItem.id);
    created = true;
  }

  const url = workItemWebUrl({ orgUrl, project: adoProject, workItemId });
  await query(
    `UPDATE bugs SET ado_work_item_id = $1, ado_work_item_url = $2, ado_last_synced_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [workItemId, url, bugId],
  );

  const shots = await attachScreenshots({
    orgUrl,
    adoProject,
    pat,
    workItemId,
    bug,
  });
  const comments = await pushCommentsToAdo({
    orgUrl,
    adoProject,
    pat,
    workItemId,
    bugId,
  });

  return {
    created,
    adoWorkItemId: workItemId,
    adoWorkItemUrl: url,
    screenshotsAttached: shots.attached,
    commentsPushed: comments.pushed,
    bug: await getBug(actor, bugId),
  };
}

/**
 * Pull title/state/comments from ADO into TestBuddy for a linked bug.
 */
export async function syncBugFromAdo(actor, bugId, { getBug, assertCanAccessBug }) {
  if (
    !canUpdateBugStatus(actor) &&
    !canFullEditBug(actor) &&
    !isSuperAdmin(actor)
  ) {
    throw forbidden("You cannot sync bugs from Azure DevOps");
  }
  await assertCanAccessBug(actor, bugId);
  const bug = await getBug(actor, bugId);
  const workItemId = bug.externalRefs?.adoWorkItemId;
  if (!workItemId) {
    throw badRequest("Bug is not linked to an Azure DevOps work item — push first");
  }

  const { orgUrl, adoProject, pat } = await loadProjectAdoCreds(bug.projectId);
  const item = await getAdoWorkItem({
    orgUrl,
    project: adoProject,
    pat,
    workItemId,
  });
  const fields = item?.fields || {};
  const title = fields["System.Title"] || bug.title;
  const state = fields["System.State"];
  const status = mapAdoStateToTbStatus(state);
  const url =
    workItemWebUrl({ orgUrl, project: adoProject, workItemId }) || bug.externalRefs?.adoWorkItemUrl;

  await query(
    `UPDATE bugs SET title = $1, status = $2, ado_work_item_url = $3, ado_last_synced_at = NOW(), updated_at = NOW()
     WHERE id = $4`,
    [title, status, url, bugId],
  );

  // Import ADO comments not yet in TestBuddy
  let commentsImported = 0;
  try {
    const adoComments = await listAdoComments({
      orgUrl,
      project: adoProject,
      pat,
      workItemId,
    });
    const { rows: existing } = await query(
      `SELECT ado_comment_id FROM bug_comments WHERE bug_id = $1 AND ado_comment_id IS NOT NULL`,
      [bugId],
    );
    const known = new Set(existing.map((r) => String(r.ado_comment_id)));
    for (const c of adoComments) {
      const cid = c.id != null ? String(c.id) : null;
      if (!cid || known.has(cid)) continue;
      const text = String(c.text || c.renderedText || "").trim();
      if (!text) continue;
      // Skip comments we ourselves pushed (marked with TestBuddy prefix)
      if (text.startsWith("[TestBuddy")) {
        // still store ado id mapping if we can find matching body later — skip import
        continue;
      }
      await query(
        `INSERT INTO bug_comments (id, bug_id, author_id, body, created_at, ado_comment_id)
         VALUES (gen_random_uuid(), $1, $2, $3, COALESCE($4::timestamptz, NOW()), $5)`,
        [
          bugId,
          actor.id,
          text.slice(0, 4000),
          c.createdDate || c.createdDateTime || null,
          cid,
        ],
      );
      commentsImported += 1;
    }
  } catch {
    /* comments API may need preview permissions */
  }

  return {
    adoWorkItemId: workItemId,
    adoWorkItemUrl: url,
    adoState: state || null,
    commentsImported,
    bug: await getBug(actor, bugId),
  };
}

/** Best-effort auto push after local create — never throws to caller. */
export async function tryAutoPushBugToAdo(actor, bugId, deps) {
  try {
    const bug = await deps.getBug(actor, bugId);
    const { rows } = await query(
      `SELECT ado_org_url, ado_project, ado_pat_encrypted FROM projects WHERE id = $1`,
      [bug.projectId],
    );
    const p = rows[0];
    if (!p?.ado_org_url || !p?.ado_project || !p?.ado_pat_encrypted) {
      return { skipped: true, reason: "ADO not configured" };
    }
    const result = await pushBugToAdo(actor, bugId, deps);
    return { skipped: false, ...result };
  } catch (err) {
    return {
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort push of a single new comment to ADO. */
export async function tryPushCommentToAdo(actor, bugId, commentId, deps) {
  try {
    const bug = await deps.getBug(actor, bugId);
    const workItemId = bug.externalRefs?.adoWorkItemId;
    if (!workItemId) return { skipped: true };
    const { orgUrl, adoProject, pat } = await loadProjectAdoCreds(bug.projectId);
    const { rows } = await query(`SELECT * FROM bug_comments WHERE id = $1`, [commentId]);
    const comment = rows[0];
    if (!comment || comment.ado_comment_id) return { skipped: true };
    const created = await addAdoComment({
      orgUrl,
      project: adoProject,
      pat,
      workItemId,
      text: `[TestBuddy — ${actor.name || "user"}]\n${comment.body}`,
    });
    if (created?.id != null) {
      await query(`UPDATE bug_comments SET ado_comment_id = $1 WHERE id = $2`, [
        String(created.id),
        commentId,
      ]);
    }
    return { skipped: false, adoCommentId: created?.id };
  } catch (err) {
    return { skipped: true, error: err instanceof Error ? err.message : String(err) };
  }
}
