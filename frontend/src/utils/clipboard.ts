/**
 * Copy text to the clipboard, reporting whether it actually worked.
 *
 * `navigator.clipboard` only exists in a secure context, so it is missing
 * whenever the app is opened over plain http on a LAN address — the async API
 * would reject and a silent catch would leave the user with nothing copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure origin — fall through to the legacy path.
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.top = "-1000px";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}
