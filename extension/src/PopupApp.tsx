import { useEffect, useMemo, useState, type FormEvent } from "react";
import browser from "webextension-polyfill";
import {
  clearSession,
  createBug,
  fetchCycles,
  fetchProjects,
  fetchUsers,
  getApiBase,
  getToken,
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
import type { BugPriority, BugSeverity, Cycle, Project, User } from "./types";

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
  const [projectId, setProjectId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingSession>(EMPTY_SESSION);
  const [polishMsg, setPolishMsg] = useState<string | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [storedToken, storedApi] = await Promise.all([getToken(), getApiBase()]);
      setToken(storedToken);
      setApiBase(storedApi);
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
        const tester = u.find((x) => x.role === "TESTER") ?? u[0];
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
        const list = await fetchCycles(projectId);
        setCycles(list);
        const def = list.find((c) => c.isDefault) ?? list[0];
        setCycleId(def?.id ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load cycles");
      }
    })();
  }, [token, projectId]);

  const canStart = useMemo(
    () =>
      mode === "BUG" &&
      title.trim() &&
      description.trim() &&
      projectId &&
      cycleId &&
      assigneeId &&
      !busy &&
      recording.status === "idle",
    [mode, title, description, projectId, cycleId, assigneeId, busy, recording.status],
  );

  const canSubmitRecording = useMemo(
    () =>
      recording.status === "stopped" &&
      !!recording.meta &&
      recording.steps.length > 0 &&
      !busy,
    [recording, busy],
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
      await setSession(result.token, apiBase);
      setToken(result.token);
      setMessage(`Signed in as ${result.user.name}`);
    } catch (err) {
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

  async function onStopRecording() {
    const res = (await browser.runtime.sendMessage({ type: "STOP_RECORDING" })) as {
      ok: boolean;
      session?: RecordingSession;
    };
    if (res.ok && res.session) setRecording(res.session);
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
      const bug = await createBug({
        ...recording.meta,
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
          <p>Sign in to record a bug</p>
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <div className="status error">{error}</div>}
          {message && <div className="status">{message}</div>}
          <p className="hint">Demo: alice@testbuddy.local / password</p>
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
                <button
                  className="primary"
                  type="button"
                  disabled={!canSubmitRecording}
                  onClick={() => void onSubmitRecording()}
                >
                  {busy ? "Uploading…" : "Upload bug with steps"}
                </button>
                <button className="linkish" type="button" onClick={() => void onClearRecording()}>
                  Discard recording
                </button>
              </>
            )}
          </div>
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
            Assignee
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
              {users.map((u) => (
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
