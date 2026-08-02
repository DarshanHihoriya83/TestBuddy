import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, "../../uploads/screenshots");

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_ROOT, { recursive: true });
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) throw new Error("Invalid screenshot dataUrl");
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function extFor(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}

export async function saveScreenshotFile(id, dataUrl) {
  await ensureUploadsDir();
  const { contentType, buffer } = parseDataUrl(dataUrl);
  const filename = `${id}${extFor(contentType)}`;
  const storagePath = path.join(UPLOADS_ROOT, filename);
  await fs.writeFile(storagePath, buffer);
  return { contentType, storagePath: filename };
}

export async function readScreenshotFile(filename) {
  return fs.readFile(path.join(UPLOADS_ROOT, filename));
}

export async function deleteScreenshotFile(filename) {
  if (!filename) return;
  try {
    await fs.unlink(path.join(UPLOADS_ROOT, filename));
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}
