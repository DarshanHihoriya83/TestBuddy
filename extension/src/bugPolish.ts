/**
 * Offline bug title/description polish engine (TestBuddy extension).
 *
 * Multi-agent style pipeline in one file — no LLM, no external deps.
 *   1. Normalize  — typos, Hinglish→English, abbreviation expansion
 *   2. Understand — subject, defect type, negation, observed/expected cues
 *   3. Title      — concise QA-style sentence-case defect title (~90 chars)
 *   4. Description— Summary / Observed / Expected / Impact (no invented steps)
 *   5. QA         — trim, dedupe, sentence case, non-empty title
 *
 * Prefer specificity over generic "does not behave as expected".
 * Do not invent features or reproduction steps that were not mentioned.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DefectType =
  | "validation"
  | "ui"
  | "functional"
  | "perf"
  | "auth"
  | "generic";

interface BugUnderstanding {
  /** Normalized source used for analysis */
  normalized: string;
  /** Primary UI/feature subject, e.g. "mobile number field" */
  subject: string;
  /** Short subject for titles (without trailing "field" when redundant) */
  subjectLabel: string;
  defectType: DefectType;
  /** True when input expresses a negative / broken state */
  negated: boolean;
  /** Concrete problem phrase for titles, e.g. "accepts non-digit characters" */
  problem: string;
  /** Human-readable observed behavior sentence fragment */
  observed: string;
  /** Human-readable expected behavior sentence fragment */
  expected: string;
  /** Optional impact hint when cues exist */
  impact: string | null;
  /** Raw cues found in text (for description fidelity) */
  cues: {
    always?: boolean;
    slow?: boolean;
    error?: boolean;
    invalid?: boolean;
    nonDigit?: boolean;
    notWorking?: boolean;
    shows?: boolean;
    accepts?: boolean;
    missing?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Agent 1 — Normalize
// ---------------------------------------------------------------------------

/** Whole-token spelling / Hinglish / contraction fixes */
const TOKEN_FIXES: Record<string, string> = {
  // Typos / truncations
  numbe: "number",
  numbr: "number",
  numb: "number",
  num: "number",
  mobil: "mobile",
  moblie: "mobile",
  moble: "mobile",
  mabile: "mobile",
  digit: "digit",
  digits: "digits",
  digt: "digit",
  digts: "digits",
  passwrd: "password",
  pasword: "password",
  passord: "password",
  passwd: "password",
  pwd: "password",
  pswd: "password",
  logn: "login",
  logiin: "login",
  loging: "login",
  registation: "registration",
  registartion: "registration",
  registraton: "registration",
  eror: "error",
  erro: "error",
  erorr: "error",
  errror: "error",
  disply: "display",
  diplay: "display",
  dipslay: "display",
  buton: "button",
  buttn: "button",
  botton: "button",
  btn: "button",
  feild: "field",
  filed: "field",
  fied: "field",
  valiation: "validation",
  validaton: "validation",
  validtion: "validation",
  invald: "invalid",
  invalide: "invalid",
  alway: "always",
  allways: "always",
  alot: "a lot",
  throuh: "through",
  recieve: "receive",
  occured: "occurred",
  succes: "success",
  sucess: "success",
  sucessful: "successful",
  unsucessful: "unsuccessful",
  // Contractions → plain English
  doesnt: "does not",
  "don't": "does not",
  dont: "does not",
  cant: "cannot",
  "can't": "cannot",
  wont: "will not",
  "won't": "will not",
  isnt: "is not",
  "isn't": "is not",
  wasnt: "was not",
  "wasn't": "was not",
  arent: "are not",
  "aren't": "are not",
  didnt: "did not",
  "didn't": "did not",
  // Hinglish / informal
  deya: "data",
  deye: "data",
  dataa: "data",
  hua: "",
  hai: "",
  nahi: "not",
  nhi: "not",
  nhahi: "not",
  galat: "incorrect",
  theek: "correct",
  sahi: "correct",
  kharab: "broken",
  khraab: "broken",
  band: "closed",
  chal: "work",
  nahi_chal: "not work",
  // Abbreviations
  mob: "mobile",
  ph: "phone",
  phn: "phone",
  tel: "telephone",
  msg: "message",
  msgs: "messages",
  cfg: "config",
  cfguration: "configuration",
  authn: "authentication",
  authz: "authorization",
  usr: "user",
  uname: "username",
  uiname: "username",
  qty: "quantity",
  amt: "amount",
  addr: "address",
  desc: "description",
  img: "image",
  imgs: "images",
  nav: "navigation",
  chk: "checkbox",
  cb: "checkbox",
  ddl: "dropdown",
  drpdwn: "dropdown",
  txt: "text",
  lbl: "label",
  req: "required",
  opt: "optional",
  info: "information",
  confirm: "confirm",
  cnfm: "confirm",
  submit: "submit",
  sbmt: "submit",
  // Common informal
  wrk: "work",
  wrking: "working",
  shw: "show",
  shwo: "show",
  shoing: "showing",
  acpt: "accept",
  acept: "accept",
  alow: "allow",
  allw: "allow",
  lod: "load",
  laod: "load",
  loding: "loading",
  slw: "slow",
  slo: "slow",
};

/** Multi-word phrase expansions (applied before token fixes when possible) */
const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\bmob(?:ile)?\s*(?:no|num|number|#)\b/gi, "mobile number"],
  [/\bmobile\s*no\.?\b/gi, "mobile number"],
  [/\bph(?:one)?\s*(?:no|num|number|#)\b/gi, "phone number"],
  [/\bphone\s*no\.?\b/gi, "phone number"],
  [/\bph\s*no\.?\b/gi, "phone number"],
  [/\buser\s*name\b/gi, "username"],
  [/\bpass\s*word\b/gi, "password"],
  [/\blog\s*in\b/gi, "login"],
  [/\bsign\s*in\b/gi, "sign in"],
  [/\bsign\s*up\b/gi, "sign up"],
  [/\bdrop\s*down\b/gi, "dropdown"],
  [/\bcheck\s*box\b/gi, "checkbox"],
  [/\btext\s*box\b/gi, "textbox"],
  [/\bnon\s*digit\b/gi, "non-digit"],
  [/\bnon\s*numeric\b/gi, "non-numeric"],
  [/\bdoes\s*nt\b/gi, "does not"],
  [/\bdid\s*nt\b/gi, "did not"],
  [/\bis\s*nt\b/gi, "is not"],
  [/\bcan\s*t\b/gi, "cannot"],
  [/\bwont\b/gi, "will not"],
  [/\bnot\s+working\b/gi, "does not work"],
  [/\bnot\s+work\b/gi, "does not work"],
  [/\bno\s+work\b/gi, "does not work"],
  [/\bnt\s+work\b/gi, "does not work"],
  [/\bnahi\s+chal(?:ta|ti|te)?\b/gi, "does not work"],
  [/\bgalat\s+(deya|data|value)\b/gi, "incorrect data"],
  [/\bwrong\s+deya\b/gi, "incorrect data"],
  [/\b(nahi|nhi)\s+aa\s*rah[aei]?\b/gi, "not received"],
  [/\baa\s*(nahi|nhi)\s*rah[aei]?\b/gi, "not received"],
  [/\b(nahi|nhi)\s+(aa|aata|ata|mil)\b/gi, "not received"],
  [/\b(nahi|nhi)\s+mil\s*rah[aei]?\b/gi, "not received"],
  [/\bnot\s+coming\b/gi, "not received"],
  [/\bnot\s+received\b/gi, "not received"],
  [/\btotal\s+(galat|wrong|incorrect)\b/gi, "incorrect total"],
  [/\b(galat|wrong|incorrect)\s+total\b/gi, "incorrect total"],
  [/\bprice\s+(galat|wrong|incorrect)\b/gi, "incorrect price"],
  [/\b(galat|wrong|incorrect)\s+(price|amount|calculation)\b/gi, "incorrect $2"],
];

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function applyPhraseFixes(text: string): string {
  let out = text;
  for (const [re, replacement] of PHRASE_FIXES) {
    out = out.replace(re, replacement);
  }
  return out;
}

function fixToken(token: string): string {
  if (/^\s+$/.test(token)) return token;

  // Preserve URLs / emails / selectors roughly
  if (/^https?:\/\//i.test(token) || /@/.test(token) || /^[.#][\w-]+$/.test(token)) {
    return token;
  }

  const match = token.match(/^([^a-zA-Z']*)([a-zA-Z']+)([^a-zA-Z']*)$/);
  if (!match) return token;

  const [, lead, core, trail] = match;
  const key = core.toLowerCase();
  const fixed = TOKEN_FIXES[key];
  if (fixed === undefined) return token;
  if (fixed === "") return `${lead}${trail}`.trim() ? `${lead}${trail}` : "";
  return `${lead}${fixed}${trail}`;
}

function normalizeText(raw: string): string {
  let text = cleanWhitespace(raw);
  if (!text) return "";

  text = applyPhraseFixes(text);
  text = text
    .split(/(\s+)/)
    .map(fixToken)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  // Drop leftover Hinglish fillers that became empty tokens
  text = text
    .replace(/\b(hua|hai)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Normalize punctuation spacing
  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]{2,})/g, (m) => m[0])
    .trim();

  return text;
}

// ---------------------------------------------------------------------------
// Agent 2 — Understand
// ---------------------------------------------------------------------------

const SUBJECT_RULES: Array<{
  test: RegExp;
  subject: string;
  label: string;
}> = [
  { test: /\bmobile\s+number\b/, subject: "mobile number field", label: "Mobile number field" },
  { test: /\bphone\s+number\b/, subject: "phone number field", label: "Phone number field" },
  { test: /\bmobile\b/, subject: "mobile number field", label: "Mobile number field" },
  { test: /\bphone\b/, subject: "phone number field", label: "Phone number field" },
  { test: /\bemail\b/, subject: "email field", label: "Email field" },
  { test: /\bpassword\b/, subject: "password field", label: "Password field" },
  { test: /\botp\b/, subject: "OTP", label: "OTP" },
  { test: /\bcart\s+total\b|\btotal\b.*\bcart\b|\bcart\b.*\btotal\b/, subject: "cart total", label: "Cart total" },
  { test: /\busername\b/, subject: "username field", label: "Username field" },
  { test: /\bcaptcha\b/, subject: "CAPTCHA", label: "CAPTCHA" },
  { test: /\blogin\s+button\b/, subject: "login button", label: "Login button" },
  { test: /\blogin\b/, subject: "login", label: "Login" },
  { test: /\bsign\s+in\b/, subject: "sign-in", label: "Sign-in" },
  { test: /\bsign\s+up\b/, subject: "sign-up", label: "Sign-up" },
  { test: /\bsubmit\s+button\b/, subject: "submit button", label: "Submit button" },
  { test: /\bsave\s+button\b/, subject: "save button", label: "Save button" },
  { test: /\bbutton\b/, subject: "button", label: "Button" },
  { test: /\bdropdown\b/, subject: "dropdown", label: "Dropdown" },
  { test: /\bcheckbox\b/, subject: "checkbox", label: "Checkbox" },
  { test: /\btextbox\b|\btext\s+field\b/, subject: "text field", label: "Text field" },
  { test: /\bsearch\b/, subject: "search", label: "Search" },
  { test: /\bcart\b/, subject: "cart", label: "Cart" },
  { test: /\bcheckout\b/, subject: "checkout", label: "Checkout" },
  { test: /\bpage\b/, subject: "page", label: "Page" },
  { test: /\bform\b/, subject: "form", label: "Form" },
  { test: /\bmodal\b|\bpopup\b|\bdialog\b/, subject: "modal dialog", label: "Modal dialog" },
  { test: /\bnavigation\b|\bmenu\b/, subject: "navigation menu", label: "Navigation menu" },
  { test: /\bimage\b/, subject: "image", label: "Image" },
  { test: /\btable\b/, subject: "table", label: "Table" },
  { test: /\blist\b/, subject: "list", label: "List" },
  { test: /\bfield\b/, subject: "field", label: "Field" },
];

const STOP_FOR_FALLBACK = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with", "not",
  "no", "is", "are", "was", "were", "be", "been", "does", "did", "do", "can",
  "cannot", "will", "would", "should", "always", "show", "shows", "showing",
  "accept", "accepts", "allow", "allows", "work", "works", "working", "error",
  "invalid", "correct", "incorrect", "digit", "digits", "slow", "load", "loads",
  "loading", "page", "please", "fix", "issue", "bug", "problem",
]);

function detectSubject(text: string): { subject: string; label: string } {
  const lower = text.toLowerCase();

  // Prefer OTP over "mobile" when both appear (e.g. "otp not coming on mobile")
  if (/\botp\b/.test(lower)) {
    return { subject: "OTP", label: "OTP" };
  }
  if (/\bcart\b/.test(lower) && /\btotal\b/.test(lower)) {
    return { subject: "cart total", label: "Cart total" };
  }

  for (const rule of SUBJECT_RULES) {
    if (rule.test.test(lower)) {
      return { subject: rule.subject, label: rule.label };
    }
  }

  const words = lower
    .split(/[^a-z0-9+-]+/)
    .filter((w) => w.length > 1 && !STOP_FOR_FALLBACK.has(w));

  if (words.length === 0) {
    return { subject: "feature", label: "Feature" };
  }

  const phrase = words.slice(0, 3).join(" ");
  const label = sentenceCase(phrase);
  return { subject: phrase, label };
}

function detectDefectType(text: string, cues: BugUnderstanding["cues"]): DefectType {
  const t = text.toLowerCase();
  if (
    cues.nonDigit ||
    cues.invalid ||
    /\b(validat|format|digit|numeric|alphabet|character|letter|regex|required|mandatory|optional)\b/.test(t)
  ) {
    return "validation";
  }
  if (/\b(login|logout|sign\s*in|sign\s*up|auth|session|token|otp|password|credential)\b/.test(t) &&
      /\b(fail|not|error|wrong|invalid|broken|cannot|unable)\b/.test(t)) {
    // Prefer auth when auth-ish + failure; login button "not work" is functional/auth
    if (/\b(login|logout|sign\s*in|auth|session|credential)\b/.test(t)) return "auth";
  }
  if (cues.slow || /\b(slow|lag|latency|timeout|performance|freeze|hang|load(?:ing)?\s+time)\b/.test(t)) {
    return "perf";
  }
  if (
    /\b(display|show|visible|hidden|align|layout|ui|css|color|font|overlap|cut\s*off|overflow|spacing)\b/.test(t)
  ) {
    return "ui";
  }
  if (
    cues.notWorking ||
    /\b(does not work|not work|broken|fail|crash|submit|click|save|upload|download|redirect)\b/.test(t)
  ) {
    return "functional";
  }
  if (/\b(login|auth|password|otp|session)\b/.test(t)) return "auth";
  return "generic";
}

function extractCues(text: string): BugUnderstanding["cues"] {
  const t = text.toLowerCase();
  return {
    always: /\balways\b|\bevery\s*time\b|\bconstantly\b/.test(t),
    slow: /\bslow\b|\blag\b|\bfreeze\b|\bhang\b|\btakes?\s+long\b/.test(t),
    error: /\berror\b|\berrors\b|\bexception\b|\bfailure\b/.test(t),
    invalid: /\binvalid\b|\bincorrect\b|\bwrong\b|\bbad\b/.test(t),
    nonDigit:
      /\bnon[- ]?digit\b|\bnot\s+digit\b|\balphabet\b|\bletter\b|\bcharacter\b|\balpha\b/.test(t) ||
      (/\bdigit\b/.test(t) && /\bnot\b/.test(t)),
    notWorking: /\bdoes not work\b|\bnot work\b|\bbroken\b|\bfail(?:s|ed|ure)?\b|\bcannot\b|\bunable\b/.test(t),
    shows: /\bshow(?:s|ing)?\b|\bdisplay(?:s|ing)?\b|\bappear(?:s|ing)?\b/.test(t),
    accepts: /\baccept(?:s|ing)?\b|\ballow(?:s|ing)?\b|\btake(?:s|ing)?\b/.test(t),
    missing:
      /\bmissing\b|\bblank\b|\bempty\b|\bnot\s+(show|display|visible|received|coming)\b|\bdisappear|\bnot received\b/.test(
        t,
      ),
  };
}

function buildProblemAndBehaviors(
  text: string,
  subject: string,
  defectType: DefectType,
  cues: BugUnderstanding["cues"],
): Pick<BugUnderstanding, "problem" | "observed" | "expected" | "impact" | "negated"> {
  const t = text.toLowerCase();
  const negated =
    cues.notWorking ||
    cues.nonDigit ||
    cues.invalid ||
    cues.missing ||
    /\bnot\b|\bno\b|\bcannot\b|\bfail|\bbroken|\binvalid|\bincorrect|\balways\b|\bslow\b/.test(t);

  // --- High-specificity patterns (ordered) ---

  // OTP not received / not coming
  if (/\botp\b/.test(t) && (cues.missing || /\bnot received\b|\bnot\s+coming\b|\bnot\s+arrive/.test(t))) {
    return {
      negated: true,
      problem: "is not received",
      observed: "the OTP is not received on the registered mobile number or email",
      expected: "a valid OTP should be delivered promptly after the request",
      impact: "Users may be unable to complete verification or login",
    };
  }

  // Incorrect total / price / amount / calculation
  if (
    /\b(total|price|amount|calculation|discount|cart)\b/.test(t) &&
    (cues.invalid || /\bincorrect\b|\bwrong\b|\bgalat\b|\bmismatch\b/.test(t))
  ) {
    const what = /\btotal\b/.test(t)
      ? "total"
      : /\bprice\b/.test(t)
        ? "price"
        : /\bamount\b/.test(t)
          ? "amount"
          : /\bdiscount\b/.test(t)
            ? "discount"
            : "value";
    if (what === "total" && /\bcart\b/.test(t)) {
      return {
        negated: true,
        problem: "is calculated incorrectly",
        observed: "the cart total displayed does not match the expected calculation",
        expected: "the cart total should calculate and display the correct amount",
        impact: "Incorrect billing or pricing may confuse users",
      };
    }
    const label = /\bcart\b/.test(subject) ? `cart ${what}` : what;
    return {
      negated: true,
      problem: `shows an incorrect ${what}`,
      observed: `the ${label} displayed does not match the expected calculation`,
      expected: `the ${label} should calculate and display the correct ${what}`,
      impact: "Incorrect billing or pricing may confuse users",
    };
  }

  // Mobile/phone + not digit / characters
  if (
    (/\bmobile|\bphone|\bnumber/.test(subject) || /\bmobile|\bphone/.test(t)) &&
    (cues.nonDigit || (/\bdigit/.test(t) && /\bnot\b/.test(t)))
  ) {
    return {
      negated: true,
      problem: "accepts non-digit characters",
      observed: "the field accepts non-digit characters (letters or special characters)",
      expected: "the field should accept digits only and reject non-digit input",
      impact: "Invalid mobile numbers may be submitted or stored",
    };
  }

  // Digits-only validation missing
  if (/\b(only\s+digit|digit\s+only|numeric\s+only)\b/.test(t) && negated) {
    return {
      negated: true,
      problem: "does not restrict input to digits only",
      observed: "non-digit characters can be entered",
      expected: "input should be restricted to digits only",
      impact: null,
    };
  }

  // Email accepts invalid
  if (/\bemail\b/.test(t) && (cues.accepts || cues.invalid || /\baccept|\ballow/.test(t))) {
    return {
      negated: true,
      problem: "accepts invalid email addresses",
      observed: "invalid email values are accepted without proper validation",
      expected: "only valid email formats should be accepted",
      impact: "Users may proceed with incorrect contact details",
    };
  }

  // Password always shows error
  if (/\bpassword\b/.test(t) && cues.error && (cues.always || cues.shows)) {
    return {
      negated: true,
      problem: "always shows an error",
      observed: "an error message is shown even when the password input appears valid",
      expected: "an error should appear only for invalid password input",
      impact: "Users may be blocked from completing authentication",
    };
  }

  // Password shows error (without always)
  if (/\bpassword\b/.test(t) && cues.error) {
    return {
      negated: true,
      problem: "shows an unexpected error",
      observed: "the password field shows an error incorrectly",
      expected: "errors should appear only when the password is invalid",
      impact: null,
    };
  }

  // Login / button not work
  if ((/\blogin\b/.test(t) || /\bbutton\b/.test(subject)) && cues.notWorking) {
    const label = /\blogin\b/.test(t) ? "login button" : subject;
    return {
      negated: true,
      problem: "does not work",
      observed: `the ${label} does not respond or complete the expected action`,
      expected: `the ${label} should complete the action successfully`,
      impact: /\blogin\b/.test(t) ? "Users may be unable to sign in" : null,
    };
  }

  // Generic not work
  if (cues.notWorking) {
    return {
      negated: true,
      problem: "does not work",
      observed: `the ${subject} does not complete the expected action`,
      expected: `the ${subject} should work according to the requirements`,
      impact: null,
    };
  }

  // Page / feature slow load
  if (cues.slow || (/\bload/.test(t) && /\bslow|lag|long/.test(t))) {
    return {
      negated: true,
      problem: "loads slowly",
      observed: "the page or content takes noticeably long to load",
      expected: "the page should load within an acceptable time",
      impact: "Poor performance may degrade the user experience",
    };
  }

  // Missing / not displayed
  if (cues.missing) {
    return {
      negated: true,
      problem: "is not displayed correctly",
      observed: `the ${subject} is missing, blank, or not visible when expected`,
      expected: `the ${subject} should be visible and display the correct content`,
      impact: null,
    };
  }

  // Shows incorrect error
  if (cues.error && cues.shows) {
    const always = cues.always ? "always " : "";
    return {
      negated: true,
      problem: `${always}shows an incorrect or unexpected error`.replace(/\s+/g, " ").trim(),
      observed: `an error is ${always}shown for the ${subject}`,
      expected: "errors should appear only when input or state is invalid",
      impact: null,
    };
  }

  // Accepts invalid (generic field)
  if (cues.accepts && cues.invalid) {
    return {
      negated: true,
      problem: "accepts invalid input",
      observed: `the ${subject} accepts invalid values`,
      expected: `the ${subject} should validate input and reject invalid values`,
      impact: null,
    };
  }

  // Accept without invalid keyword but validation type
  if (cues.accepts && defectType === "validation") {
    return {
      negated: true,
      problem: "accepts invalid input",
      observed: `the ${subject} accepts values that should be rejected`,
      expected: `the ${subject} should enforce correct validation rules`,
      impact: null,
    };
  }

  // Always + something
  if (cues.always && cues.error) {
    return {
      negated: true,
      problem: "always shows an error",
      observed: `the ${subject} always shows an error`,
      expected: "errors should only appear when appropriate",
      impact: null,
    };
  }

  // Fallback by defect type — still prefer concrete wording
  switch (defectType) {
    case "validation":
      return {
        negated,
        problem: "does not validate input correctly",
        observed: `input validation for the ${subject} does not behave correctly`,
        expected: "input should be validated according to the field rules",
        impact: null,
      };
    case "ui":
      return {
        negated,
        problem: "does not display correctly",
        observed: `the ${subject} UI appearance is incorrect`,
        expected: "the UI should display content and layout correctly",
        impact: null,
      };
    case "perf":
      return {
        negated,
        problem: "performs poorly",
        observed: `the ${subject} responds slowly`,
        expected: "the feature should respond within an acceptable time",
        impact: "Performance issues may affect usability",
      };
    case "auth":
      return {
        negated,
        problem: "authentication does not complete correctly",
        observed: "authentication or session handling does not complete as expected",
        expected: "users should be able to authenticate successfully with valid credentials",
        impact: "Users may be unable to access the application",
      };
    case "functional":
      return {
        negated,
        problem: "does not function correctly",
        observed: `the ${subject} does not function correctly`,
        expected: `the ${subject} should function according to the requirements`,
        impact: null,
      };
    default:
      return {
        negated,
        problem: "does not function correctly",
        observed: `the ${subject} does not function correctly based on the reported notes`,
        expected: `the ${subject} should behave according to the requirements`,
        impact: null,
      };
  }
}

function understandBug(rawTitle: string, rawDescription = ""): BugUnderstanding {
  const combined = cleanWhitespace(`${rawTitle} ${rawDescription}`);
  const normalized = normalizeText(combined);
  const cues = extractCues(normalized);
  const { subject, label } = detectSubject(normalized);
  const defectType = detectDefectType(normalized, cues);
  const behaviors = buildProblemAndBehaviors(normalized, subject, defectType, cues);

  return {
    normalized,
    subject,
    subjectLabel: label,
    defectType,
    cues,
    ...behaviors,
  };
}

// ---------------------------------------------------------------------------
// Shared text helpers (Agent 5 helpers reused by 3–4)
// ---------------------------------------------------------------------------

function sentenceCase(text: string): string {
  const t = cleanWhitespace(text);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ensurePeriod(text: string): string {
  const t = cleanWhitespace(text);
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function stripTrailingJunk(text: string): string {
  return cleanWhitespace(text)
    .replace(/[|\\/_-]{2,}/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateTitle(title: string, max = 90): string {
  const t = cleanWhitespace(title);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function looksAlreadyProfessional(text: string): boolean {
  const t = cleanWhitespace(text);
  if (!t || t.length < 28) return false;
  if (!/^[A-Z]/.test(t)) return false;
  if (/\b(hai|hua|deya|nahi|nhi|galat|numbe|buton|feild|eror|btn|pwd|mob\b)\b/i.test(t)) {
    return false;
  }
  // Rough notes often lack articles / verbs — require a verb-like token
  if (!/\b(is|are|does|do|not|accepts|allows|shows|fails|loads|displays|returns|throws|appears|missing|broken|incorrect|invalid|unable|cannot)\b/i.test(t)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Agent 3 — Title
// ---------------------------------------------------------------------------

function composeTitle(u: BugUnderstanding, rawTitle: string): string {
  const rawNorm = normalizeText(rawTitle);

  // Keep a clear professional title if the tester already wrote one well
  if (looksAlreadyProfessional(rawNorm) && rawNorm.length <= 90) {
    return sentenceCase(stripTrailingJunk(rawNorm));
  }

  // Prefer "Subject problem" — subjectLabel already sentence-cased nouns
  let title = `${u.subjectLabel} ${u.problem}`;

  // Avoid "Login login ..." duplication
  title = title.replace(/\b([A-Za-z][a-z]+)\s+\1\b/gi, "$1");

  // Avoid "Field field"
  title = title.replace(/\bField field\b/gi, "Field");

  title = sentenceCase(stripTrailingJunk(title));
  title = truncateTitle(title, 90);

  return title || "Reported defect requires investigation";
}

// ---------------------------------------------------------------------------
// Agent 4 — Description
// ---------------------------------------------------------------------------

function composeDescription(
  u: BugUnderstanding,
  polishedTitle: string,
  rawDescription: string,
  rawTitle: string,
): string {
  const summary = polishedTitle || u.subjectLabel;
  const observedLine = sentenceCase(u.observed);
  const expectedLine = sentenceCase(u.expected);

  // Extra description body only when it adds detail beyond the title (no invented steps)
  const descOnly = normalizeText(rawDescription);
  const titleOnly = normalizeText(rawTitle);
  const extraNotes =
    descOnly &&
    descOnly.toLowerCase() !== titleOnly.toLowerCase() &&
    descOnly.toLowerCase() !== polishedTitle.toLowerCase() &&
    descOnly.length >= 12
      ? sentenceCase(descOnly)
      : null;

  const lines: string[] = [
    "Summary",
    ensurePeriod(summary),
    "",
    "Observed behavior",
    ensurePeriod(observedLine),
  ];

  if (
    extraNotes &&
    extraNotes.toLowerCase() !== observedLine.toLowerCase() &&
    !observedLine.toLowerCase().includes(extraNotes.toLowerCase().replace(/\.$/, ""))
  ) {
    lines.push(`Additional notes: ${ensurePeriod(extraNotes)}`);
  }

  lines.push("", "Expected behavior", ensurePeriod(expectedLine));

  if (u.impact) {
    lines.push("", "Impact", ensurePeriod(u.impact));
  }

  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Agent 5 — QA pass
// ---------------------------------------------------------------------------

function qaTitle(title: string, fallbackSource: string): string {
  let t = stripTrailingJunk(title);
  t = sentenceCase(t);
  t = truncateTitle(t, 90);
  t = t.replace(/\s+/g, " ").trim();

  if (!t) {
    const fb = composeTitle(understandBug(fallbackSource), fallbackSource);
    t = fb || "Reported defect requires investigation";
  }

  // Deduplicate repeated words ("Field field", "error error")
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // No trailing punctuation in titles (tracker style)
  t = t.replace(/[.!?]+$/g, "").trim();

  return t;
}

function qaDescription(description: string, polishedTitle: string): string {
  let d = description.replace(/\r\n/g, "\n").trim();
  if (!d) {
    d = [
      "Summary",
      ensurePeriod(polishedTitle || "Reported defect"),
      "",
      "Observed behavior",
      "The reported behavior does not match the expected result.",
      "",
      "Expected behavior",
      "The feature should behave according to the requirements.",
    ].join("\n");
  }

  // Collapse excessive blank lines
  d = d.replace(/\n{3,}/g, "\n\n").trim();

  // Ensure title/summary line isn't an exact empty section
  if (!/Summary/i.test(d) && polishedTitle) {
    d = `Summary\n${ensurePeriod(polishedTitle)}\n\n${d}`;
  }

  return d;
}

function dedupeTitleDescriptionBleed(title: string, description: string): {
  title: string;
  description: string;
} {
  // If description Summary equals title, fine; avoid stuffing title into Observed as-is only
  return { title, description };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Polish a rough bug title into a concise, sentence-case QA defect title.
 * Uses description as extra context when title is sparse.
 */
export function polishBugTitle(rawTitle: string, rawDescription = ""): string {
  const source = cleanWhitespace(rawTitle) || cleanWhitespace(rawDescription);
  if (!source) return "";

  const understanding = understandBug(rawTitle || source, rawDescription);
  const drafted = composeTitle(understanding, rawTitle || source);
  return qaTitle(drafted, source);
}

/**
 * Expand rough notes into a structured professional description.
 * Sections: Summary, Observed behavior, Expected behavior, optional Impact.
 * Does not invent reproduction steps or unmentioned features.
 */
export function polishBugDescription(
  rawDescription: string,
  rawTitle = "",
  polishedTitle?: string,
): string {
  const title =
    polishedTitle ||
    polishBugTitle(rawTitle || rawDescription, rawDescription);
  const source = cleanWhitespace(rawDescription) || cleanWhitespace(rawTitle);
  if (!title && !source) return "";

  const understanding = understandBug(rawTitle, rawDescription || rawTitle);
  const drafted = composeDescription(understanding, title, rawDescription, rawTitle);
  return qaDescription(drafted, title);
}

/**
 * Polish title and description together so they stay consistent.
 */
export function polishBugCopy(
  rawTitle: string,
  rawDescription: string,
): { title: string; description: string } {
  const title = polishBugTitle(rawTitle, rawDescription);
  const description = polishBugDescription(rawDescription, rawTitle, title);
  return dedupeTitleDescriptionBleed(title, description);
}
