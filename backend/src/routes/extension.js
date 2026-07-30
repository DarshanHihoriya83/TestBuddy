import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zipPath = path.resolve(__dirname, "../../public/downloads/TestBuddy-extension.zip");

router.get("/download", (req, res) => {
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ message: "Extension package not found" });
  }
  res.download(zipPath, "TestBuddy-extension.zip");
});

export default router;
