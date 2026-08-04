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
import userRoutes from "./routes/users.js";
import bugRoutes from "./routes/bugs.js";
import screenshotRoutes from "./routes/screenshots.js";
import extensionRoutes from "./routes/extension.js";
import aiRoutes from "./routes/ai.js";
import organizationRoutes from "./routes/organizations.js";
import { ensureUploadsDir } from "./services/screenshotStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.length === 0) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
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
app.use("/api/organizations", organizationRoutes);
app.use("/api/users", userRoutes);
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
