import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const defaultJwtSecret = "testbuddy-dev-secret-change-me-32chars-minimum!";

if (isProd && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required when NODE_ENV=production");
}

export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://admin:admin@localhost:5432/testbuddy",
  jwtSecret: process.env.JWT_SECRET || defaultJwtSecret,
  jwtExpirationMs: Number(process.env.JWT_EXPIRATION_MS || 86_400_000),
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://127.0.0.1:8001",
  /** Max projects a Manager may create (lifetime, by created_by). SuperAdmin unlimited. */
  maxProjectsPerManager: Number(process.env.MAX_PROJECTS_PER_MANAGER || 10),
  /** Default org project cap when SuperAdmin creates an org without maxProjects. */
  defaultOrgMaxProjects: Number(process.env.DEFAULT_ORG_MAX_PROJECTS || 10),
  /** Comma-separated allowlist. Empty = reflect request Origin (dev). */
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
