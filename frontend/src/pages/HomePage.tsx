import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useAuth } from "../auth";

const EXTENSION_ZIP = "/TestBuddy-extension.zip";

export function HomePage() {
  const { token } = useAuth();

  return (
    <Shell title="Home">
      <div className="min-h-full">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(13,148,136,0.08), transparent 40%), radial-gradient(circle at 80% 0%, rgba(59,130,246,0.06), transparent 35%)",
            }}
          />

          <div className="relative grid w-full items-center gap-12 py-12 lg:grid-cols-2 lg:py-16">
            <div>
              <span className="tb-badge">Browser extension + dashboard</span>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
                Capture bugs while you test.
                <span className="text-[var(--accent)]"> Review in one place.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--muted)]">
                Record clicks, navigation, and screenshots from any webpage. Turn sessions into
                structured bug reports and manage them with your team.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href={EXTENSION_ZIP} download="TestBuddy-extension.zip" className="tb-btn-primary">
                  Download extension
                </a>
                <Link to={token ? "/bugs" : "/login"} className="tb-btn-ghost">
                  {token ? "View bugs" : "Sign in"}
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  { title: "Record", desc: "Live steps & screenshots" },
                  { title: "Review", desc: "Edit bugs in dashboard" },
                  { title: "Export", desc: "JSON import / export" },
                ].map((item) => (
                  <div key={item.title} className="tb-card p-4">
                    <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="tb-card tb-card-accent p-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
                Quick install
              </h2>
              <ol className="mt-5 space-y-4 text-sm leading-relaxed text-[var(--ink)]">
                <li className="flex gap-3">
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    1
                  </span>
                  <span>
                    Download &amp; unzip{" "}
                    <code className="rounded bg-[var(--bg0)] px-1.5 py-0.5 text-xs">
                      TestBuddy-extension.zip
                    </code>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    2
                  </span>
                  <span>
                    Open <code className="text-xs">chrome://extensions</code> → Developer mode
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    3
                  </span>
                  <span>
                    <strong>Load unpacked</strong> → select the TestBuddy folder
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    4
                  </span>
                  <span>Sign in via popup → start recording on any site</span>
                </li>
              </ol>
              <p className="mt-6 rounded-lg bg-[var(--bg0)] p-3 text-xs text-[var(--muted)]">
                Backend API: <code className="text-[var(--accent)]">http://localhost:8080</code>
              </p>
            </aside>
          </div>
        </section>

        <footer className="border-t border-[var(--line)] bg-white py-6 text-center text-xs text-[var(--muted)]">
          TestBuddy — QA bug capture platform
        </footer>
      </div>
    </Shell>
  );
}
