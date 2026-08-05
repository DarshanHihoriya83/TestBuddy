/**
 * Focused security checks for the temporary-password flow.
 * Run against a live backend: node scripts/verify-password-security.mjs
 */
const API = process.env.API_URL || "http://localhost:8080";

let passed = 0;
let failed = 0;

function pass(label, detail = "") {
  passed += 1;
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failed += 1;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, { token, ...init } = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}

async function login(email, password) {
  return call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

const admin = await login("superadmin@testbuddy.local", "password");
if (!admin.res.ok) {
  console.error("Cannot log in as superadmin — is the backend seeded?", admin.text);
  process.exit(1);
}
const adminToken = admin.json.token;

const email = `sec.check.${Date.now()}@testbuddy.local`;
const created = await call("/api/users", {
  token: adminToken,
  method: "POST",
  body: JSON.stringify({ name: "Security Check", email, role: "TESTER" }),
});

if (created.res.status !== 201 || !created.json?.temporaryPassword) {
  console.error("Create user failed", created.text);
  process.exit(1);
}
const tempPassword = created.json.temporaryPassword;

// 1. Temporary password satisfies the policy it enforces on users
const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
if (tempPassword.length >= 12 && classes.every((re) => re.test(tempPassword))) {
  pass("temporary password meets policy", `${tempPassword.length} chars, all classes`);
} else {
  fail("temporary password meets policy", tempPassword);
}

// 2. Two generated passwords never collide
const second = await call("/api/users", {
  token: adminToken,
  method: "POST",
  body: JSON.stringify({ name: "Security Check Two", email: `two.${email}`, role: "TESTER" }),
});
if (second.json?.temporaryPassword && second.json.temporaryPassword !== tempPassword) {
  pass("generated passwords are unique");
} else {
  fail("generated passwords are unique");
}

// 3. Forced change blocks the whole API, not just a URL pattern
const pending = await login(email, tempPassword);
const pendingToken = pending.json.token;
for (const path of ["/api/projects", "/api/bugs", "/api/users/admin", "/api/organizations"]) {
  const blocked = await call(path, { token: pendingToken });
  if (blocked.res.status === 403) pass(`forced change blocks ${path}`);
  else fail(`forced change blocks ${path}`, `status ${blocked.res.status}`);
}

// 4. Trailing-slash / casing cannot slip past the gate
const sneaky = await call("/api/Projects", { token: pendingToken });
if (sneaky.res.status === 403 || sneaky.res.status === 404) {
  pass("gate not bypassable via path casing", `status ${sneaky.res.status}`);
} else {
  fail("gate not bypassable via path casing", `status ${sneaky.res.status}`);
}

// 5. Weak / personal passwords rejected
const weakCases = [
  ["password", "banned word"],
  ["Short1!", "too short"],
  ["alllowercase1!", "no uppercase"],
  ["ALLUPPERCASE1!", "no lowercase"],
  ["NoDigitsHere!!", "no digit"],
  ["NoSymbols12345", "no symbol"],
  ["Aaa!11bbbbbb", "repeated characters"],
  ["Security1!Check", "contains the user's name"],
];
for (const [candidate, why] of weakCases) {
  const attempt = await call("/api/auth/profile", {
    token: pendingToken,
    method: "PUT",
    body: JSON.stringify({
      name: "Security Check",
      currentPassword: tempPassword,
      newPassword: candidate,
    }),
  });
  if (attempt.res.status === 400) pass(`rejects weak password (${why})`);
  else fail(`rejects weak password (${why})`, `status ${attempt.res.status}`);
}

// 6. Successful change reissues a token and revokes the old one
const strong = "Vn6#kRa-2q";
const changed = await call("/api/auth/profile", {
  token: pendingToken,
  method: "PUT",
  body: JSON.stringify({
    name: "Security Check",
    currentPassword: tempPassword,
    newPassword: strong,
  }),
});
if (changed.res.ok && changed.json?.token && changed.json.mustChangePassword === false) {
  pass("password change reissues a token");
} else {
  fail("password change reissues a token", changed.text);
}
const newToken = changed.json?.token;

const oldTokenCheck = await call("/api/auth/me", { token: pendingToken });
if (oldTokenCheck.res.status === 401) pass("pre-change token is revoked");
else fail("pre-change token is revoked", `status ${oldTokenCheck.res.status}`);

const newTokenCheck = await call("/api/projects", { token: newToken });
if (newTokenCheck.res.ok) pass("reissued token works immediately");
else fail("reissued token works immediately", `status ${newTokenCheck.res.status}`);

// 7. Old temporary password no longer authenticates
const staleLogin = await login(email, tempPassword);
if (staleLogin.res.status === 401) pass("temporary password stops working after change");
else fail("temporary password stops working after change", `status ${staleLogin.res.status}`);

// 8. Admin reset signs the user out everywhere
const reset = await call(`/api/users/${created.json.id}/reset-password`, {
  token: adminToken,
  method: "POST",
  body: JSON.stringify({}),
});
if (reset.res.ok && reset.json?.temporaryPassword) pass("admin reset returns a temporary password");
else fail("admin reset returns a temporary password", reset.text);

const afterReset = await call("/api/projects", { token: newToken });
if (afterReset.res.status === 401) pass("admin reset revokes the user's live session");
else fail("admin reset revokes the user's live session", `status ${afterReset.res.status}`);

// 9. Admins cannot set a password directly
const directSet = await call(`/api/users/${created.json.id}`, {
  token: adminToken,
  method: "PUT",
  body: JSON.stringify({ newPassword: "Vn6#kRa-9z" }),
});
if (directSet.res.status === 400) pass("admin cannot set a password directly");
else fail("admin cannot set a password directly", `status ${directSet.res.status}`);

// 10. Admin cannot reset their own password through the admin endpoint
const selfReset = await call(`/api/users/${admin.json.user.id}/reset-password`, {
  token: adminToken,
  method: "POST",
  body: JSON.stringify({}),
});
if (selfReset.res.status === 400) pass("admin cannot self-reset via admin endpoint");
else fail("admin cannot self-reset via admin endpoint", `status ${selfReset.res.status}`);

// 11. Unauthenticated callers cannot reset anyone
const anonReset = await call(`/api/users/${created.json.id}/reset-password`, {
  method: "POST",
  body: JSON.stringify({}),
});
if (anonReset.res.status === 401) pass("anonymous reset rejected");
else fail("anonymous reset rejected", `status ${anonReset.res.status}`);

// 12. Login does not leak whether an account exists
const unknown = await login(`nobody.${Date.now()}@testbuddy.local`, "whatever");
const wrongPassword = await login("superadmin@testbuddy.local", "definitely-wrong");
if (
  unknown.res.status === 401 &&
  wrongPassword.res.status === 401 &&
  unknown.json?.message === wrongPassword.json?.message
) {
  pass("login does not reveal whether the email exists");
} else {
  fail(
    "login does not reveal whether the email exists",
    `${unknown.json?.message} / ${wrongPassword.json?.message}`,
  );
}

// 13. Temporary passwords are never echoed on read endpoints
const directory = await call("/api/users/admin", { token: adminToken });
if (!directory.text.includes("temporaryPassword") && !directory.text.includes("passwordHash")) {
  pass("user directory leaks no password material");
} else {
  fail("user directory leaks no password material");
}

// Cleanup
for (const id of [created.json.id, second.json?.id].filter(Boolean)) {
  await call(`/api/users/${id}`, {
    token: adminToken,
    method: "PUT",
    body: JSON.stringify({ active: false }),
  });
  await call(`/api/users/${id}/permanent`, { token: adminToken, method: "DELETE" });
}

console.log("\n==========================");
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
