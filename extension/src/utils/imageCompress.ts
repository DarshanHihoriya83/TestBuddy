/**
 * High-clarity screenshot encode: keep resolution (up to ~2560px),
 * prefer WebP, fall back to JPEG — small KB without mushy text.
 */

const MAX_EDGE = 2560;
const TARGET_BYTES = 420_000; // ~420 KB aim
const MIN_QUALITY = 0.72;
const START_QUALITY = 0.88;

function dataUrlByteLength(dataUrl: string) {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

async function canvasToDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL(type, quality);
  }
  const blob = await canvas.convertToBlob({ type, quality });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:${type};base64,${btoa(binary)}`;
}

function supportsWebp(): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/** Resize only if longer edge exceeds MAX_EDGE — never upscale. */
export function fitCanvasSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scale: 1 };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Encode an already-drawn canvas (annotations burned in) for storage/upload.
 */
export async function encodeScreenshotCanvas(
  source: HTMLCanvasElement,
): Promise<{ dataUrl: string; contentType: string; bytes: number }> {
  const { width, height } = fitCanvasSize(source.width, source.height);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) {
    const dataUrl = source.toDataURL("image/jpeg", START_QUALITY);
    return { dataUrl, contentType: "image/jpeg", bytes: dataUrlByteLength(dataUrl) };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);

  const preferWebp = supportsWebp();
  const type = preferWebp ? "image/webp" : "image/jpeg";
  let quality = START_QUALITY;
  let dataUrl = await canvasToDataUrl(out, type, quality);
  let bytes = dataUrlByteLength(dataUrl);

  while (bytes > TARGET_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.06);
    dataUrl = await canvasToDataUrl(out, type, quality);
    bytes = dataUrlByteLength(dataUrl);
  }

  // Still huge? one more step: soft downscale to 1920 long edge
  if (bytes > TARGET_BYTES * 1.35 && Math.max(width, height) > 1920) {
    const fitted = fitCanvasSize(width, height, 1920);
    const smaller = document.createElement("canvas");
    smaller.width = fitted.width;
    smaller.height = fitted.height;
    const sctx = smaller.getContext("2d");
    if (sctx) {
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(out, 0, 0, fitted.width, fitted.height);
      dataUrl = await canvasToDataUrl(smaller, type, Math.max(quality, 0.8));
      bytes = dataUrlByteLength(dataUrl);
    }
  }

  return { dataUrl, contentType: type, bytes };
}

/** Service-worker friendly shrink of a data URL while keeping sharpness. */
export async function compressDataUrlForStorage(dataUrl: string): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const fitted = fitCanvasSize(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(fitted.width, fitted.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = true;
    // OffscreenCanvasRenderingContext2D may not have imageSmoothingQuality in all SW envs
    try {
      (ctx as OffscreenCanvasRenderingContext2D).imageSmoothingQuality = "high";
    } catch {
      /* ignore */
    }
    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height);
    bitmap.close();

    let quality = START_QUALITY;
    let type: "image/webp" | "image/jpeg" = "image/jpeg";
    try {
      const probe = await canvas.convertToBlob({ type: "image/webp", quality: 0.5 });
      if (probe.type === "image/webp") type = "image/webp";
    } catch {
      type = "image/jpeg";
    }

    let out = await canvas.convertToBlob({ type, quality });
    while (out.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.06);
      out = await canvas.convertToBlob({ type, quality });
    }

    const buffer = await out.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return dataUrl;
  }
}
