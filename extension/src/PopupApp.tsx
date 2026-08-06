import { useEffect, useMemo, useState, type FormEvent } from "react";
import browser from "webextension-polyfill";
import {
  assertExtensionTester,
  clearSession,
  createBug,
  fetchCycles,
  fetchMe,
  fetchModules,
  fetchProjects,
  fetchUsers,
  getApiBase,
  getToken,
  humanizeStepsWithAi,
  login,
  polishBugWithAi,
  setSession,
} from "./api";
import {
  EMPTY_SESSION,
  RECORDING_STORAGE_KEY,
  type RecordingSession,
} from "./recording";
import { composeBugDescription } from "./content/bugCapture";
import { polishBugCopy, polishBugDescription, polishBugTitle } from "./bugPolish";
import { renderBoldText } from "./renderBold";
import type { BugPriority, BugSeverity, Cycle, Module, Project, User } from "./types";

type Mode = "BUG" | "TEST_CASE";

export function PopupApp() {
  const [token, setToken] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState("http://localhost:8080");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<BugPriority>("MEDIUM");
  const [severity, setSeverity] = useState<BugSeverity>("MAJOR");
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [projectId, setProjectId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingSession>(EMPTY_SESSION);
  const [polishMsg, setPolishMsg] = useState<string | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);
  const [stepsAiBusy, setStepsAiBusy] = useState(false);
  const [stepsAiMsg, setStepsAiMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [storedToken, storedApi] = await Promise.all([getToken(), getApiBase()]);
      setApiBase(storedApi);
      if (!storedToken) {
        setToken(null);
        return;
      }
      try {
        // Re-validate: extension sessions must be Tester-only
        const me = await fetchMe();
        assertExtensionTester(me);
        await setSession(storedToken, storedApi, me);
        setToken(storedToken);
      } catch (err) {
        await clearSession();
        setToken(null);
        setError(
          err instanceof Error
            ? err.message
            : "Session expired. Sign in with a Tester account.",
        );
      }
      const res = (await browser.runtime.sendMessage({ type: "GET_RECORDING_STATE" })) as {
        ok: boolean;
        session?: RecordingSession;
      };
      if (res?.ok && res.session) setRecording(res.session);
    })();
  }, []);

  useEffect(() => {
    function onChange(changes: { [key: string]: { newValue?: unknown } }, area: string) {
      if (area !== "local" || !changes[RECORDING_STORAGE_KEY]) return;
      setRecording(
        (changes[RECORDING_STORAGE_KEY].newValue as RecordingSession) || EMPTY_SESSION,
      );
    }
    // webextension-polyfill listener typing is stricter than our narrow handler
    browser.storage.onChanged.addListener(onChange as never);
    return () => browser.storage.onChanged.removeListener(onChange as never);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        setError(null);
        const [u, p] = await Promise.all([fetchUsers(), fetchProjects()]);
        setUsers(u);
        setProjects(p);
        const firstProject = p[0];
        if (firstProject) setProjectId(firstProject.id);
        const tester =
          u.find((x) => x.role === "TESTER" && x.active !== false) ??
          u.find((x) => x.role !== "SUPERADMIN" && x.active !== false) ??
          u[0];
        if (tester) setAssigneeId(tester.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load catalog");
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !projectId) return;
    void (async () => {
      try {
        const [cycleList, moduleList] = await Promise.all([
          fetchCycles(projectId),
          fetchModules(projectId),
        ]);
        setCycles(cycleList);
        setModules(moduleList);
        const def = cycleList.find((c) => c.isDefault) ?? cycleList[0];
        setCycleId((prev) =>
          prev && cycleList.some((c) => c.id === prev) ? prev : def?.id ?? "",
        );
        // Keep current module if still valid; otherwise default to first / empty
        setModuleId((prev) => {
          if (prev && moduleList.some((m) => m.id === prev)) return prev;
          return moduleList[0]?.id ?? "";
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load project catalog");
      }
    })();
  }, [token, projectId]);

  // When a stopped recording loads, restore project/module/cycle from its meta
  useEffect(() => {
    if (recording.status !== "stopped" || !recording.meta) return;
    if (recording.meta.projectId) setProjectId(recording.meta.projectId);
    if (recording.meta.cycleId) setCycleId(recording.meta.cycleId);
    if (recording.meta.moduleId) setModuleId(recording.meta.moduleId);
    if (recording.meta.assigneeId) setAssigneeId(recording.meta.assigneeId);
  }, [recording.status, recording.meta]);

  async function patchRecordingModule(nextModuleId: string) {
    setModuleId(nextModuleId);
    if (recording.status !== "stopped" || !recording.meta) return;
    const moduleName = modules.find((m) => m.id === nextModuleId)?.name;
    const res = (await browser.runtime.sendMessage({
      type: "PATCH_RECORDING_META",
      meta: {
        moduleId: nextModuleId || undefined,
        moduleName: moduleName || undefined,
      },
    })) as { ok: boolean; session?: RecordingSession };
    if (res?.ok && res.session) setRecording(res.session);
  }

  const canStart = useMemo(
    () =>
      mode === "BUG" &&
      title.trim() &&
      description.trim() &&
      projectId &&
      cycleId &&
      assigneeId &&
      (modules.length === 0 || !!moduleId) &&
      !busy &&
      recording.status === "idle",
    [mode, title, description, projectId, cycleId, moduleId, modules.length, assigneeId, busy, recording.status],
  );

  const canSubmitRecording = useMemo(
    () =>
      recording.status === "stopped" &&
      !!recording.meta &&
      recording.steps.length > 0 &&
      !busy &&
      !stepsAiBusy,
    [recording, busy, stepsAiBusy],
  );

  async function generateWithAi(mode: "both" | "title" | "description") {
    const source = title.trim() || description.trim();
    if (!source) {
      setError("Type a rough title or description first, then Generate");
      return;
    }
    setError(null);
    setPolishMsg(null);
    setPolishBusy(true);
    try {
      const result = await polishBugWithAi({
        title: title.trim(),
        description: description.trim(),
        mode,
      });
      if (mode === "title" || mode === "both") setTitle(result.title);
      if (mode === "description" || mode === "both") setDescription(result.description);
      const who = result.ai
        ? `AI (${result.provider || "LLM"})`
        : `local polish${result.warning ? " — set GROQ_API_KEY for ChatGPT-level AI" : ""}`;
      setPolishMsg(`Generated with ${who}`);
    } catch (err) {
      // Offline / AI down → local professional polish
      if (mode === "title") {
        setTitle(polishBugTitle(title, description));
      } else if (mode === "description") {
        const nextTitle = title.trim()
          ? polishBugTitle(title, description)
          : polishBugTitle(description);
        if (!title.trim()) setTitle(nextTitle);
        setDescription(polishBugDescription(description, title, nextTitle));
      } else {
        const polished = polishBugCopy(title, description);
        setTitle(polished.title);
        setDescription(polished.description);
      }
      const msg = err instanceof Error ? err.message : "AI unavailable";
      setPolishMsg(`Used offline polish (AI unreachable: ${msg.slice(0, 80)})`);
    } finally {
      setPolishBusy(false);
    }
  }

  function onRegenerateTitle() {
    void generateWithAi("title");
  }

  function onRegenerateDescription() {
    void generateWithAi("description");
  }

  function onPolishBoth() {
    void generateWithAi("both");
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await login(email, password, apiBase);
      assertExtensionTester(result.user);
      await setSession(result.token, apiBase, result.user);
      setToken(result.token);
      setMessage(`Signed in as ${result.user.name} (Tester)`);
    } catch (err) {
      await clearSession();
      setToken(null);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await clearSession();
    setToken(null);
    setMessage(null);
  }

  async function onStartRecording(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab to record");
      if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.startsWith("about:")) {
        throw new Error("Open a normal webpage first — cannot record browser internal pages");
      }

      const res = (await browser.runtime.sendMessage({
        type: "START_RECORDING",
        tabId: tab.id,
        meta: {
          title: title.trim(),
          description: description.trim(),
          priority,
          severity,
          assigneeId,
          cycleId,
          projectId,
          moduleId: moduleId || undefined,
          moduleName: modules.find((m) => m.id === moduleId)?.name,
        },
      })) as { ok: boolean; session?: RecordingSession; error?: string };

      if (!res?.ok || !res.session) {
        throw new Error(res?.error || "Failed to start recording");
      }
      if (res.session.status !== "recording") {
        throw new Error(res.error || "Recorder did not start — reload the page and try again");
      }
      setRecording(res.session);
      setMessage("Recording started — use the on-page toolbar. Events update live.");
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  async function polishRecordingSteps(session: RecordingSession): Promise<RecordingSession> {
    if (!session.steps.length) return session;
    const shotOverview = new Map(
      (session.screenshots || []).map((s) => [s.id, s.overview] as const),
    );
    const result = await humanizeStepsWithAi({
      title: session.meta?.title || title,
      description: session.meta?.description || description,
      steps: session.steps.map((step) => ({
        order: step.order,
        actionType: step.actionType,
        elementLabel: step.elementLabel,
        valueEntered: step.valueEntered,
        pageUrl: step.pageUrl,
        screenshotId: step.screenshotId,
        overview: step.screenshotId ? shotOverview.get(step.screenshotId) : undefined,
        description: step.description,
        actualResult: step.actualResult,
        expectedResult: step.expectedResult,
        isDefect: Boolean(step.screenshotId || step.expectedResult?.trim()),
      })),
    });

    const patchRes = (await browser.runtime.sendMessage({
      type: "PATCH_STEP_TEXTS",
      steps: result.steps,
    })) as { ok: boolean; session?: RecordingSession };

    const next = patchRes.ok && patchRes.session ? patchRes.session : session;
    const who = result.ai
      ? `AI (${result.provider || "LLM"})`
      : `local templates${result.warning ? " — check Groq / AI service" : ""}`;
    setStepsAiMsg(`Steps / Actual / Expected rewritten with ${who}`);
    return next;
  }

  async function onStopRecording() {
    setError(null);
    setStepsAiMsg(null);
    const res = (await browser.runtime.sendMessage({ type: "STOP_RECORDING" })) as {
      ok: boolean;
      session?: RecordingSession;
    };
    if (!res.ok || !res.session) return;

    setRecording(res.session);
    setStepsAiBusy(true);
    try {
      const polished = await polishRecordingSteps(res.session);
      setRecording(polished);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI step polish failed";
      setStepsAiMsg(`Kept recorded step text (AI unavailable: ${msg.slice(0, 80)})`);
    } finally {
      setStepsAiBusy(false);
    }
  }

  async function onImproveStepsWithAi() {
    if (recording.status !== "stopped" || !recording.steps.length) return;
    setStepsAiBusy(true);
    setStepsAiMsg(null);
    setError(null);
    try {
      const polished = await polishRecordingSteps(recording);
      setRecording(polished);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve steps with AI");
    } finally {
      setStepsAiBusy(false);
    }
  }

  async function onClearRecording() {
    const res = (await browser.runtime.sendMessage({ type: "CLEAR_RECORDING" })) as {
      ok: boolean;
      session?: RecordingSession;
    };
    if (res.ok && res.session) {
      setRecording(res.session);
      setMessage(null);
    }
  }

  async function onSubmitRecording() {
    if (!canSubmitRecording || !recording.meta) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      assertExtensionTester(await fetchMe());
      const bug = await createBug({
        ...recording.meta,
        moduleId: moduleId || recording.meta.moduleId || undefined,
        description: composeBugDescription(
          recording.meta.description,
          recording.screenshots || [],
        ),
        status: "NEW",
        steps: recording.steps.map((step) => ({
          order: step.order,
          actionType: step.actionType,
          elementLabel: step.elementLabel,
          selector: step.selector,
          valueEntered: step.valueEntered,
          pageUrl: step.pageUrl,
          description: step.description,
          actualResult: step.actualResult,
          expectedResult: step.expectedResult?.trim() ? step.expectedResult : undefined,
          screenshotId: step.screenshotId,
        })),
        screenshots: (recording.screenshots || []).map((shot) => ({
          id: shot.id,
          dataUrl: shot.dataUrl,
          overview: shot.overview,
          pageUrl: shot.pageUrl,
          createdAt: shot.createdAt,
          annotations: shot.annotations,
        })),
      });
      await browser.runtime.sendMessage({ type: "CLEAR_RECORDING" });
      setRecording(EMPTY_SESSION);
      setTitle("");
      setDescription("");
      setMessage(
        `Bug created with ${bug.steps.length} steps` +
          (bug.screenshots?.length
            ? ` and ${bug.screenshots.length} screenshot(s)`
            : "") +
          `: ${bug.id}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="app">
        <div className="brand">
          <h1>TestBuddy</h1>
          <p>Tester sign-in — record &amp; file bugs</p>
        </div>
        <form className="panel" onSubmit={onLogin}>
          <label>
            API base URL
            <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in as Tester"}
          </button>
          {error && <div className="status error">{error}</div>}
          {message && <div className="status">{message}</div>}
          <p className="hint">
            Only <strong>Tester</strong> accounts can use the extension.
            <br />
            Demo: alice@testbuddy.local / password
          </p>
        </form>
      </div>
    );
  }

  const isLive = recording.status === "recording" || recording.status === "paused";

  return (
    <div className="app">
      <div className="brand">
        <h1>TestBuddy</h1>
        <p>Record browser steps with a live event counter</p>
      </div>

      {(isLive || recording.status === "stopped") && (
        <div className={`live-panel ${recording.status}`}>
          <div className="live-header">
            <div>
              <div className="live-label">
                {recording.status === "recording" && "Recording…"}
                {recording.status === "paused" && "Paused"}
                {recording.status === "stopped" && "Recording stopped"}
              </div>
              <div className="live-meta">{recording.meta?.title}</div>
            </div>
            <div className="live-count">
              <span className="live-count-num">{recording.steps.length}</span>
              <span className="live-count-label">events</span>
            </div>
          </div>
          {(recording.screenshots?.length || 0) > 0 && (
            <div className="live-shots">
              {recording.screenshots.length} highlighted screenshot
              {recording.screenshots.length === 1 ? "" : "s"}
            </div>
          )}
          <div className="live-feed" aria-live="polite">
            {recording.steps.length === 0 ? (
              <div className="live-empty">No steps yet — interact with the page.</div>
            ) : (
              (recording.status === "stopped"
                ? recording.steps
                : [...recording.steps].slice(-8).reverse()
              ).map((step) => (
                <div className="live-event" key={`${step.order}-${step.description}`}>
                  <div className="live-event-head">
                    <span className="live-order">Step {step.order}</span>
                    <span className="live-type">{step.actionType}</span>
                    {step.expectedResult ? (
                      <span className="live-bug-tag">Bug step</span>
                    ) : null}
                  </div>
                  <div className="live-desc">
                    <strong>Step:</strong> {renderBoldText(step.description)}
                  </div>
                  {step.actualResult ? (
                    <div className="live-actual">
                      <strong>Actual:</strong> {renderBoldText(step.actualResult)}
                    </div>
                  ) : null}
                  {step.expectedResult ? (
                    <div className="live-expected">
                      <strong>Expected:</strong> {renderBoldText(step.expectedResult)}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="live-actions">
            {isLive && (
              <button className="primary" type="button" onClick={() => void onStopRecording()}>
                Stop recording
              </button>
            )}
            {recording.status === "stopped" && (
              <>
                <label className="live-module">
                  Module
                  <select
                    value={moduleId}
                    onChange={(e) => void patchRecordingModule(e.target.value)}
                    required={modules.length > 0}
                    disabled={busy || stepsAiBusy}
                  >
                    {modules.length === 0 ? (
                      <option value="">No modules in this project</option>
                    ) : (
                      <>
                        <option value="" disabled>
                          Select module…
                        </option>
                        {modules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </label>
                <button
                  className="primary"
                  type="button"
                  disabled={
                    !canSubmitRecording ||
                    stepsAiBusy ||
                    (modules.length > 0 && !moduleId)
                  }
                  onClick={() => void onSubmitRecording()}
                >
                  {busy ? "Uploading…" : "Upload bug with steps"}
                </button>
                <button
                  className="linkish"
                  type="button"
                  disabled={stepsAiBusy || recording.steps.length === 0}
                  onClick={() => void onImproveStepsWithAi()}
                >
                  {stepsAiBusy ? "AI rewriting steps…" : "✨ Improve Actual / Expected with AI"}
                </button>
                <button className="linkish" type="button" onClick={() => void onClearRecording()}>
                  Discard recording
                </button>
              </>
            )}
          </div>
          {stepsAiBusy && (
            <div className="status polish-ok">Rewriting Step / Actual / Expected with Groq AI…</div>
          )}
          {stepsAiMsg && !stepsAiBusy && <div className="status polish-ok">{stepsAiMsg}</div>}
        </div>
      )}
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === "BUG" ? "active" : ""}
          onClick={() => setMode("BUG")}
        >
          Bug
        </button>
        <button
          type="button"
          className={mode === "TEST_CASE" ? "active" : ""}
          onClick={() => setMode("TEST_CASE")}
        >
          Test Case
        </button>
      </div>

      {mode === "TEST_CASE" ? (
        <div className="panel">
          <p className="disabled-note">
            Test Case mode arrives in Phase 4. Switch back to Bug to record.
          </p>
          <button className="linkish" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      ) : recording.status === "idle" ? (
        <form className="panel" onSubmit={onStartRecording}>
          <div className="field-head">
            <label className="field-label" htmlFor="bug-title">
              Title
            </label>
            <button
              type="button"
              className="regen-btn"
              onClick={onRegenerateTitle}
              disabled={polishBusy || (!title.trim() && !description.trim())}
            >
              {polishBusy ? "AI…" : title.trim() ? "Regenerate" : "Generate"}
            </button>
          </div>
          <input
            id="bug-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setPolishMsg(null);
            }}
            placeholder="e.g. mobile number not digit"
            required
          />

          <div className="field-head">
            <label className="field-label" htmlFor="bug-desc">
              Description
            </label>
            <button
              type="button"
              className="regen-btn"
              onClick={onRegenerateDescription}
              disabled={polishBusy || (!title.trim() && !description.trim())}
            >
              {polishBusy ? "AI…" : description.trim() ? "Regenerate" : "Generate"}
            </button>
          </div>
          <textarea
            id="bug-desc"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setPolishMsg(null);
            }}
            placeholder="Rough notes about the bug…"
            required
          />

          <button
            type="button"
            className="polish-both"
            onClick={onPolishBoth}
            disabled={polishBusy || (!title.trim() && !description.trim())}
          >
            {polishBusy ? "Generating with AI…" : "✨ AI polish title & description"}
          </button>
          {polishMsg && <div className="status polish-ok">{polishMsg}</div>}

          <div className="row">
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as BugPriority)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>
            <label>
              Severity
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BugSeverity)}
              >
                <option value="MINOR">MINOR</option>
                <option value="MAJOR">MAJOR</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="BLOCKER">BLOCKER</option>
              </select>
            </label>
          </div>
          <label>
            Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cycle
            <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} required>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              required={modules.length > 0}
            >
              {modules.length === 0 ? (
                <option value="">No modules in this project</option>
              ) : (
                <>
                  <option value="" disabled>
                    Select module…
                  </option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label>
            Assignee
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
              {users
                .filter((u) => u.role !== "SUPERADMIN" && u.active !== false)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
            </select>
          </label>
          <button className="primary" type="submit" disabled={!canStart}>
            {busy ? "Starting…" : "Start Recording"}
          </button>
          <button className="linkish" type="button" onClick={onLogout}>
            Sign out
          </button>
          {error && <div className="status error">{error}</div>}
          {message && <div className="status">{message}</div>}
          <p className="hint">
            Tip: write rough notes (Hinglish OK) → tap <strong>AI polish</strong>. Uses Groq /
            OpenAI / Claude via the AI service for ChatGPT-quality titles &amp; descriptions.
          </p>
        </form>
      ) : (
        <div className="panel">
          <p className="disabled-note">
            Finish or discard the current recording before starting a new one.
          </p>
          <button className="linkish" type="button" onClick={onLogout}>
            Sign out
          </button>
          {error && <div className="status error">{error}</div>}
          {message && <div className="status">{message}</div>}
        </div>
      )}
    </div>
  );
}
