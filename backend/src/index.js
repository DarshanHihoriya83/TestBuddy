import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { ensureSchema, pool } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import bugRoutes from "./routes/bugs.js";
import screenshotRoutes from "./routes/screenshots.js";
import extensionRoutes from "./routes/extension.js";
import aiRoutes from "./routes/ai.js";
import { ensureUploadsDir } from "./services/screenshotStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use(
  "/downloads",
  express.static(path.join(__dirname, "../public/downloads")),
);

app.use("/api", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api", aiRoutes);
app.use("/api/bugs", bugRoutes);
app.use("/api/screenshots", screenshotRoutes);
app.use("/api/extension", extensionRoutes);

app.use(errorHandler);

async function main() {
  await ensureSchema();
  await ensureUploadsDir();
  await seedIfEmpty();
  app.listen(config.port, () => {
    console.log(`testbuddy-backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
