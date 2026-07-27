import { Link } from "react-router-dom";
import { useAuth } from "../auth";

const EXTENSION_ZIP = "/TestBuddy-extension.zip";

export function HomePage() {
  const { token, user } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)]/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            TestBuddy
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {token ? (
              <>
                <span className="hidden text-[var(--muted)] sm:inline">{user?.name}</span>
                <Link
                  to="/bugs"
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-white"
                >
                  Open dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-white"
                >
                  Register
                </Link>
                <Link
                  to="/login"
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-white"
                >
                  Sign in
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(15,110,86,0.18), transparent 55%), linear-gradient(165deg, #e8eef4 0%, #f4f7fa 42%, #e4efe9 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-18deg, transparent, transparent 18px, rgba(23,32,51,0.04) 18px, rgba(23,32,51,0.04) 19px)",
            }}
          />

          <div className="relative mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="font-[family-name:Georgia,serif] text-5xl tracking-tight text-[var(--ink)] sm:text-6xl">
                TestBuddy
              </p>
              <h1 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
                Capture bugs from the browser. Review them here.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--muted)]">
                Download the Chrome extension, load the unzipped folder once, then file
                bugs straight from any page into your TestBuddy project.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={EXTENSION_ZIP}
                  download="TestBuddy-extension.zip"
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                >
                  Download extension (.zip)
                </a>
                <Link
                  to={token ? "/bugs" : "/login"}
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-white/80 px-5 py-3 text-sm font-semibold text-[var(--ink)] hover:bg-white"
                >
                  {token ? "Go to bugs" : "Sign in to dashboard"}
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-[var(--line)] bg-white/85 p-6 shadow-sm backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Install in Chrome
              </h2>
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--ink)]">
                <li>
                  <span className="font-semibold">1.</span> Download and unzip{" "}
                  <code className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs">
                    TestBuddy-extension.zip
                  </code>
                </li>
                <li>
                  <span className="font-semibold">2.</span> Open{" "}
                  <code className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs">
                    chrome://extensions
                  </code>{" "}
                  and turn on Developer mode
                </li>
                <li>
                  <span className="font-semibold">3.</span> Click <strong>Load unpacked</strong> and
                  select the unzipped <strong>TestBuddy</strong> folder (the one that
                  contains <code className="text-xs">manifest.json</code>)
                </li>
                <li>
                  <span className="font-semibold">4.</span> Open a normal webpage, fill the bug
                  form in the popup, click <strong>Start Recording</strong>, then use the
                  floating toolbar — live event count updates as you click
                </li>
              </ol>
              <p className="mt-5 text-xs text-[var(--muted)]">
                Backend must be running at <code>http://localhost:8080</code> for the
                extension to sign in and upload bugs.
              </p>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
