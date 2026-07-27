"""Build extension/dist into a browser-ready zip for Load unpacked."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "extension" / "dist"
STAGING = ROOT / "extension" / ".pack-staging" / "TestBuddy"
ZIP_NAME = "TestBuddy-extension.zip"
OUTPUTS = [
    ROOT / "frontend" / "public" / ZIP_NAME,
    ROOT / "backend" / "src" / "main" / "resources" / "static" / "downloads" / ZIP_NAME,
]


def main() -> None:
    if not (DIST / "manifest.json").is_file():
        raise SystemExit(
            "extension/dist/manifest.json missing. Run: cd extension && npm run build"
        )

    if STAGING.parent.exists():
        shutil.rmtree(STAGING.parent)
    STAGING.mkdir(parents=True)

    for item in DIST.iterdir():
        target = STAGING / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)

    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            out.unlink()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in STAGING.rglob("*"):
                if path.is_file():
                    zf.write(path, path.relative_to(STAGING.parent).as_posix())
        print(f"Wrote {out} ({out.stat().st_size} bytes)")

    shutil.rmtree(STAGING.parent)

    # Sanity: zip must contain TestBuddy/manifest.json
    with zipfile.ZipFile(OUTPUTS[0]) as zf:
        names = zf.namelist()
        if "TestBuddy/manifest.json" not in names:
            raise SystemExit(f"Zip missing TestBuddy/manifest.json. Found: {names[:10]}")
        print("Verified TestBuddy/manifest.json inside zip")
        print("Entries:", ", ".join(names[:12]), ("…" if len(names) > 12 else ""))


if __name__ == "__main__":
    main()
